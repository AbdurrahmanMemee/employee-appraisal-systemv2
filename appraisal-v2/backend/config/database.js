// =============================================================================
// FILE:    config/database.js
// PURPOSE: Creates and exports the MySQL connection pool.
//          All database queries in the application go through this pool.
//
// WHAT IS A CONNECTION POOL?
//   Instead of opening and closing a database connection for every request
//   (slow), a pool keeps a set of connections open and ready to use.
//   When a request needs the database it borrows a connection, uses it,
//   then returns it to the pool for the next request.
//
// EXPORTS:
//   pool        — the raw mysql2 pool (use for simple queries)
//   dbUtils     — helper functions that make querying easier and safer
// =============================================================================

const mysql  = require('mysql2/promise');
require('dotenv').config();

// ---- Pool configuration -----------------------------------------------------
const pool = mysql.createPool({
  host:              process.env.DB_HOST     || 'localhost',
  port:              parseInt(process.env.DB_PORT) || 3306,
  user:              process.env.DB_USER,
  password:          process.env.DB_PASSWORD || '',
  database:          process.env.DB_NAME,
  charset:           'utf8mb4',
  timezone:          '+00:00',

  // Pool sizing — for a small office team 10 connections is plenty
  connectionLimit:   10,
  waitForConnections: true,
  queueLimit:        0,           // 0 = unlimited queue

  // Reconnect if the connection drops (e.g. after MySQL restart)
  enableKeepAlive:   true,
  keepAliveInitialDelay: 0,

  // Dates come back as JS Date objects, not strings
  dateStrings:       false,

  // Prevent multiple statements in one query (SQL injection protection)
  multipleStatements: false,
});

// ---- Test the connection at startup -----------------------------------------
// This runs once when the server starts. If it fails, we know immediately
// rather than finding out when the first request comes in.
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT DATABASE() AS db, VERSION() AS version');
    console.log(`✅  Database connected: ${rows[0].db} (MySQL ${rows[0].version})`);
    connection.release();
    return true;
  } catch (error) {
    console.error('❌  Database connection failed:', error.message);
    return false;
  }
};

// ---- Helper utilities -------------------------------------------------------
// These wrap the raw pool to make route code cleaner and more consistent.

const dbUtils = {

  // query(sql, params)
  // Use for SELECT statements.
  // Returns { rows, fields } — rows is always an array.
  // Example: const { rows } = await dbUtils.query('SELECT * FROM employees WHERE id = ?', [id]);\
  //
  // IMPORTANT — LIMIT / OFFSET:
  //   pool.execute() uses prepared statements. MySQL's prepared statement protocol
  //   does NOT accept LIMIT/OFFSET as bound parameters (throws "Incorrect arguments
  //   to mysqld_stmt_execute"). Always interpolate them directly:
  //     LIMIT ${limitInt} OFFSET ${offsetInt}   ← correct
  //     LIMIT ? OFFSET ?                         ← crashes
  //   This is safe because limitInt/offsetInt must always be parseInt'd first.
  query: async (sql, params = []) => {
    const [rows, fields] = await pool.execute(sql, params);
    return { rows, fields };
  },

  // insert(sql, params)
  // Use for INSERT statements.
  // Returns { insertId, affectedRows }
  // Example: const { insertId } = await dbUtils.insert('INSERT INTO meetings ...', [...]);
  insert: async (sql, params = []) => {
    const [result] = await pool.execute(sql, params);
    return { insertId: result.insertId, affectedRows: result.affectedRows };
  },

  // update(sql, params)
  // Use for UPDATE and DELETE statements.
  // Returns { affectedRows, changedRows }
  update: async (sql, params = []) => {
    const [result] = await pool.execute(sql, params);
    return { affectedRows: result.affectedRows, changedRows: result.changedRows };
  },

  // transaction(callback)
  // Use when you need multiple queries to succeed or fail together.
  // If any query inside the callback throws, ALL changes are rolled back.
  // Example: move money between accounts — both the debit AND credit must succeed.
  //
  // Usage:
  //   await dbUtils.transaction(async (conn) => {
  //     await conn.execute('UPDATE employees SET ...', [...]);
  //     await conn.execute('INSERT INTO audit_trail ...', [...]);
  //   });
  transaction: async (callback) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;  // re-throw so the route can handle it
    } finally {
      connection.release();
    }
  },

  // getOne(sql, params)
  // Convenience function — returns the first row or null if not found.
  // Example: const employee = await dbUtils.getOne('SELECT * FROM employees WHERE id = ?', [id]);
  getOne: async (sql, params = []) => {
    const { rows } = await dbUtils.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  },

  // exists(sql, params)
  // Returns true if any row matches, false otherwise.
  // Example: const taken = await dbUtils.exists('SELECT 1 FROM users WHERE username = ?', [username]);
  exists: async (sql, params = []) => {
    const { rows } = await dbUtils.query(sql, params);
    return rows.length > 0;
  },
};

module.exports = { pool, dbUtils, testConnection };
