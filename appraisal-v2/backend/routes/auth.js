// =============================================================================
// FILE:    routes/auth.js
// PURPOSE: Authentication endpoints — login, logout, and token refresh.
//
// ROUTES:
//   POST /api/auth/login    — validate credentials, return JWT token
//   POST /api/auth/logout   — client-side logout (clears token instructions)
//   GET  /api/auth/me       — return current user info (requires token)
// =============================================================================

const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const { dbUtils }               = require('../config/database');
const { asyncHandler }          = require('../middleware/errorHandler');
const { authenticate }          = require('../middleware/auth');
const { logAudit }              = require('../utils/auditLogger');

const router = express.Router();

// ---- Validation rules for login form ----------------------------------------
const loginValidation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ max: 50 })
    .withMessage('Username too long'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

// ---- POST /api/auth/login ---------------------------------------------------
// Accepts username + password, returns a JWT token if credentials are valid.
//
// Response on success:
//   { success: true, token: "...", user: { id, username, role, full_name } }
//
// Response on failure:
//   { success: false, message: "Invalid username or password" }
//
// SECURITY NOTE: We always return the same error message whether the username
// doesn't exist OR the password is wrong. This prevents "username enumeration"
// where an attacker could tell which usernames exist by the error message.

router.post('/login', loginValidation, asyncHandler(async (req, res) => {
  // Step 1: Check validation rules passed
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }

  const { username, password } = req.body;

  // Step 2: Find the user by username
  const user = await dbUtils.getOne(
    'SELECT id, username, password_hash, full_name, role, employee_id, is_active FROM users WHERE username = ?',
    [username.trim()]
  );

  // Step 3: Validate — use same error message for "not found" and "wrong password"
  // bcrypt.compare is intentionally run even when user is null (using a dummy hash)
  // to prevent timing attacks that could reveal whether a username exists
  const DUMMY_HASH = '$2a$12$dummyhashtopreventtimingattacksonuserlookup123456789';
  const hashToCheck = user ? user.password_hash : DUMMY_HASH;
  const passwordValid = await bcrypt.compare(password, hashToCheck);

  if (!user || !passwordValid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid username or password.',
    });
  }

  // Step 4: Check account is active
  if (!user.is_active) {
    return res.status(401).json({
      success: false,
      message: 'Account is deactivated. Contact your administrator.',
    });
  }

  // Step 5: Create the JWT token
  // The payload is the data encoded inside the token — keep it small
  const tokenPayload = {
    id:          user.id,
    username:    user.username,
    role:        user.role,
    full_name:   user.full_name,
    employee_id: user.employee_id || null,  // null for admin users not in employee table
  };

  const token = jwt.sign(
    tokenPayload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  // Step 6: Update last_login_at timestamp
  await dbUtils.update(
    'UPDATE users SET last_login_at = NOW() WHERE id = ?',
    [user.id]
  );

  // Step 7: Log the login to audit trail
  await logAudit({
    table_name: 'users',
    record_id:  user.id,
    action:     'UPDATE',
    new_values: { event: 'LOGIN', username: user.username },
    changed_by: user.username,
    ip_address: req.ip,
    user_agent: req.get('user-agent'),
  });

  // Step 8: Return the token and user info
  res.json({
    success: true,
    message: 'Login successful.',
    token,
    user: {
      id:        user.id,
      username:  user.username,
      role:      user.role,
      full_name: user.full_name,
    },
  });
}));

// ---- GET /api/auth/me -------------------------------------------------------
// Returns the current user's info. Used by the frontend on page load to
// check if the stored token is still valid.

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  // req.user is populated by the authenticate middleware
  const user = await dbUtils.getOne(
    'SELECT id, username, full_name, role, email, is_active, last_login_at, employee_id FROM users WHERE id = ?',
    [req.user.id]
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found.',
    });
  }

  res.json({
    success: true,
    data: user,
  });
}));

// ---- POST /api/auth/logout --------------------------------------------------
// JWT tokens cannot be invalidated server-side (stateless by design).
// Logout is handled client-side by deleting the stored token.
// This endpoint exists so the frontend has somewhere to call,
// and so we can log the logout event.

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await logAudit({
    table_name: 'users',
    record_id:  req.user.id,
    action:     'UPDATE',
    new_values: { event: 'LOGOUT', username: req.user.username },
    changed_by: req.user.username,
    ip_address: req.ip,
    user_agent: req.get('user-agent'),
  });

  res.json({
    success: true,
    message: 'Logged out successfully.',
  });
}));

module.exports = router;
