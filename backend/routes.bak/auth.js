// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbUtils } = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/authMiddleware');
const { loginValidation } = require('../utils/validation');

// POST /api/auth/login
router.post('/login', loginValidation, asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  // Find user
  const { rows } = await dbUtils.query(
    'SELECT id, username, email, password_hash, role, is_active FROM users WHERE username = ?',
    [username]
  );

  if (rows.length === 0 || !rows[0].is_active) {
    // Generic error message to prevent username enumeration
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const user = rows[0];

  // Verify password
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  // Update last login
  await dbUtils.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

  // Sign JWT
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    }
  });
}));

// GET /api/auth/me - get current user
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    }
  });
}));

// POST /api/auth/logout
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  // JWT is stateless - client removes the token
  // In production you'd add the token to a denylist / use short expiry + refresh tokens
  res.json({ success: true, message: 'Logged out successfully' });
}));

// POST /api/auth/change-password
router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ success: false, message: 'Both current and new passwords are required' });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
  }

  // Get current hash
  const { rows } = await dbUtils.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (rows.length === 0) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const isMatch = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  const newHash = await bcrypt.hash(new_password, parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12);
  await dbUtils.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

  res.json({ success: true, message: 'Password changed successfully' });
}));

module.exports = router;
