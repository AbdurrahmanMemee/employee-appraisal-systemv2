// =============================================================================
// FILE:    scripts/seed.js
// PURPOSE: Creates default admin and manager users in the new schema.
//          Run AFTER schema_v2.sql has been applied.
//
// USAGE:   node scripts/seed.js
//
// CREATES:
//   admin   / Admin123!    (role: admin,   employee_id: null)
//   manager / Manager123!  (role: manager, employee_id: null — link to employee later)
// =============================================================================

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, BCRYPT_SALT_ROUNDS } = process.env;

if (!DB_USER || !DB_NAME) {
    console.error('\n❌  Missing DB_USER or DB_NAME in .env');
    process.exit(1);
}

async function seed() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host:     DB_HOST     || 'localhost',
            port:     parseInt(DB_PORT) || 3306,
            user:     DB_USER,
            password: DB_PASSWORD || '',
            database: DB_NAME,
            charset:  'utf8mb4',
        });
        console.log(`\n✅  Connected to MySQL as '${DB_USER}'`);
    } catch (err) {
        console.error('❌  Connection failed:', err.message);
        process.exit(1);
    }

    const saltRounds = parseInt(BCRYPT_SALT_ROUNDS) || 12;

    // ---- Admin user ---------------------------------------------------------
    const [existingAdmin] = await connection.execute(
        'SELECT id FROM users WHERE username = ?', ['admin']
    );
    if (existingAdmin.length > 0) {
        console.log('ℹ️   Admin user already exists — skipping');
    } else {
        const hash = await bcrypt.hash('Admin123!', saltRounds);
        await connection.execute(
            `INSERT INTO users (username, email, password_hash, full_name, role, employee_id)
             VALUES (?, ?, ?, ?, 'admin', NULL)`,
            ['admin', 'admin@company.com', hash, 'System Administrator']
        );
        console.log('✅  Admin user created  →  admin / Admin123!');
    }

    // ---- Manager user -------------------------------------------------------
    const [existingManager] = await connection.execute(
        'SELECT id FROM users WHERE username = ?', ['manager']
    );
    if (existingManager.length > 0) {
        console.log('ℹ️   Manager user already exists — skipping');
    } else {
        const hash = await bcrypt.hash('Manager123!', saltRounds);
        await connection.execute(
            `INSERT INTO users (username, email, password_hash, full_name, role, employee_id)
             VALUES (?, ?, ?, ?, 'manager', NULL)`,
            ['manager', 'manager@company.com', hash, 'Default Manager']
        );
        console.log('✅  Manager user created  →  manager / Manager123!');
    }

    await connection.end();

    console.log(`
==============================================
  Seed complete!
==============================================
  admin   / Admin123!    (role: admin)
  manager / Manager123!  (role: manager)

  ⚠️  Change these passwords after first login!
  ⚠️  Link manager user to their employee record
      once employees are loaded.
==============================================
`);
}

seed().catch(err => {
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
});
