// backend/scripts/seed.js
// Creates the users table and default admin account.
//
// IMPORTANT — OCI / Ubuntu users:
//   MySQL root uses OS-level auth (auth_socket) on OCI Ubuntu — no password.
//   Do NOT run this script with DB_USER=root.
//
//   First run the setup script which creates a dedicated app user:
//     chmod +x scripts/setup-mysql-oci.sh && ./scripts/setup-mysql-oci.sh
//
//   Or manually:
//     sudo mysql -e "CREATE DATABASE employee_appraisals CHARACTER SET utf8mb4;"
//     sudo mysql -e "CREATE USER 'appraisal_user'@'localhost' IDENTIFIED BY 'YourSecurePassword123!';"
//     sudo mysql -e "GRANT ALL ON employee_appraisals.* TO 'appraisal_user'@'localhost'; FLUSH PRIVILEGES;"
//   Then set DB_USER and DB_PASSWORD in your .env and rerun: node scripts/seed.js
//
// Default app login credentials created by this script:
//   Username : admin     Password : Admin123!   (role: admin)
//   Username : manager   Password : Manager123! (role: manager)

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, BCRYPT_SALT_ROUNDS } = process.env;

if (!DB_USER || !DB_NAME) {
  console.error('\n❌ Missing DB_USER or DB_NAME in .env'); process.exit(1);
}

if (DB_USER === 'root' && !DB_PASSWORD) {
  console.error(`
❌ You are connecting as 'root' with no password.

On OCI Ubuntu, MySQL root uses OS-level auth (auth_socket) and cannot
connect via a Node.js script. You need a dedicated database user.

Quick fix — run the all-in-one setup script:
  chmod +x scripts/setup-mysql-oci.sh && ./scripts/setup-mysql-oci.sh

Or manually:
  sudo mysql <<SQL
  CREATE DATABASE IF NOT EXISTS employee_appraisals CHARACTER SET utf8mb4;
  CREATE USER 'appraisal_user'@'localhost' IDENTIFIED BY 'YourStrongPassword!';
  GRANT ALL ON employee_appraisals.* TO 'appraisal_user'@'localhost';
  FLUSH PRIVILEGES;
  SQL

Then update backend/.env:
  DB_USER=appraisal_user
  DB_PASSWORD=YourStrongPassword!

Then rerun:  node scripts/seed.js
`);
  process.exit(1);
}

async function seed() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: DB_HOST || 'localhost',
      port: parseInt(DB_PORT) || 3306,
      user: DB_USER,
      password: DB_PASSWORD || '',
      database: DB_NAME,
      charset: 'utf8mb4'
    });
    console.log(`\n✅ Connected to MySQL as '${DB_USER}'@'${DB_HOST || 'localhost'}'`);
  } catch (err) {
    if (err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR') {
      console.error(`
❌ Access denied for '${DB_USER}'@'${DB_HOST || 'localhost'}'

On OCI Ubuntu, MySQL root uses OS auth — it cannot connect via Node.js.
Run the setup script to create a dedicated user automatically:

  chmod +x scripts/setup-mysql-oci.sh && ./scripts/setup-mysql-oci.sh
`);
    } else if (err.code === 'ECONNREFUSED') {
      console.error('\n❌ Cannot connect to MySQL. Is it running?\n   sudo systemctl start mysql');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error(`\n❌ Database '${DB_NAME}' does not exist.\n   sudo mysql -e "CREATE DATABASE ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`);
    } else {
      console.error('\n❌ Connection failed:', err.message);
    }
    process.exit(1);
  }

  try {
    console.log('\n🔧 Creating users table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        username      VARCHAR(50)  UNIQUE NOT NULL,
        email         VARCHAR(150) UNIQUE NULL,
        password_hash VARCHAR(255) NOT NULL,
        role          ENUM('admin','manager','user') DEFAULT 'user',
        is_active     BOOLEAN DEFAULT TRUE,
        last_login    TIMESTAMP NULL,
        created_date  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_email    (email),
        INDEX idx_role     (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Users table ready');

    const saltRounds = parseInt(BCRYPT_SALT_ROUNDS) || 12;

    const [existingAdmin] = await connection.execute('SELECT id FROM users WHERE username = ?', ['admin']);
    if (existingAdmin.length > 0) {
      console.log('ℹ️  Admin user already exists — skipping');
    } else {
      const adminHash = await bcrypt.hash('Admin123!', saltRounds);
      await connection.execute(
        "INSERT INTO users (username, email, password_hash, role, is_active) VALUES (?, ?, ?, 'admin', TRUE)",
        ['admin', 'admin@company.com', adminHash]
      );
      console.log('✅ Admin user created  →  admin / Admin123!');
    }

    const [existingManager] = await connection.execute('SELECT id FROM users WHERE username = ?', ['manager']);
    if (existingManager.length > 0) {
      console.log('ℹ️  Manager user already exists — skipping');
    } else {
      const managerHash = await bcrypt.hash('Manager123!', saltRounds);
      await connection.execute(
        "INSERT INTO users (username, email, password_hash, role, is_active) VALUES (?, ?, ?, 'manager', TRUE)",
        ['manager', 'manager@company.com', managerHash]
      );
      console.log('✅ Manager user created  →  manager / Manager123!');
    }

    console.log(`
==============================================
  Seed complete!
==============================================
  admin   / Admin123!    (role: admin)
  manager / Manager123!  (role: manager)

  ⚠️  Change these passwords after first login!
`);
  } catch (err) {
    console.error('\n❌ Seed error:', err.message);
    if (err.code === 'ER_TABLEACCESS_DENIED_ERROR') {
      console.error(`   Grant privileges with:\n   sudo mysql -e "GRANT ALL ON ${DB_NAME}.* TO '${DB_USER}'@'localhost'; FLUSH PRIVILEGES;"`);
    }
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

seed();
