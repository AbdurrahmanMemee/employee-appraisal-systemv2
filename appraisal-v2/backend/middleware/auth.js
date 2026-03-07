// =============================================================================
// FILE:    middleware/auth.js
// PURPOSE: JWT authentication + role enforcement + token invalidation check.
//
// HOW TOKEN INVALIDATION WORKS:
//   Normal request flow (fast path — no DB hit for valid active users):
//     1. Verify JWT signature locally
//     2. Check invalidated_tokens table for this user_id (one indexed lookup,
//        cached in memory for 60s — deactivation takes effect within 1 minute)
//     3. If not invalidated -> continue
//
//   When a user is deactivated:
//     - Their user_id is inserted into invalidated_tokens
//     - All subsequent requests from their token are rejected
//     - No need to wait for the 7-day JWT expiry
//
//   When a user is reactivated:
//     - Their row is removed from invalidated_tokens
//     - clearInvalidationCache(userId) flushes the memory cache
//     - They can log in again and get a fresh token
//
// EXPORTS:
//   authenticate            - verifies JWT + checks invalidation
//   requireRole             - restricts route to specific roles
//   getSubordinateIds       - returns all employee IDs a manager can access
//   clearInvalidationCache  - flush cache entry when user is reactivated
// =============================================================================

const jwt    = require('jsonwebtoken');
const { pool } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET;

// Cache invalidated user IDs in memory for 60 seconds.
// Prevents a DB hit on every request while still revoking access
// within 1 minute of deactivation.
const invalidationCache = new Map(); // userId -> { invalidated: bool, cachedAt: timestamp }
const CACHE_TTL_MS = 60 * 1000;

// ---- isUserInvalidated ------------------------------------------------------
const isUserInvalidated = async (userId) => {
    const cached = invalidationCache.get(userId);
    const now    = Date.now();

    if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
        return cached.invalidated;
    }

    const [rows] = await pool.execute(
        'SELECT id FROM invalidated_tokens WHERE user_id = ? LIMIT 1',
        [userId]
    );

    const invalidated = rows.length > 0;
    invalidationCache.set(userId, { invalidated, cachedAt: now });
    return invalidated;
};

// ---- clearInvalidationCache -------------------------------------------------
// Call when a user is reactivated so the cache does not serve stale data.
const clearInvalidationCache = (userId) => {
    invalidationCache.delete(userId);
};

// ---- authenticate -----------------------------------------------------------
// After this runs successfully, req.user contains:
//   { id, username, role, full_name, employee_id }
//
// employee_id is the employees.id linked to this user (null for admin users
// who are not in the employee table).

const authenticate = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token      = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.',
        });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Session expired. Please log in again.',
                code: 'TOKEN_EXPIRED',
            });
        }
        return res.status(401).json({
            success: false,
            message: 'Invalid token. Please log in again.',
            code: 'TOKEN_INVALID',
        });
    }

    // Check invalidation table — handles deactivated users without re-querying
    // the full users table on every request
    try {
        const invalidated = await isUserInvalidated(decoded.id);
        if (invalidated) {
            return res.status(401).json({
                success: false,
                message: 'Account has been deactivated. Contact your administrator.',
                code: 'ACCOUNT_DEACTIVATED',
            });
        }
    } catch (error) {
        // If the invalidation check fails, fail safe — reject the request
        console.error('Invalidation check failed:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Authentication service error.',
        });
    }

    req.user = {
        id:          decoded.id,
        username:    decoded.username,
        role:        decoded.role,
        full_name:   decoded.full_name,
        employee_id: decoded.employee_id || null,
    };

    next();
};

// ---- requireRole ------------------------------------------------------------
// Must be used AFTER authenticate.
// Usage: router.post('/employees', authenticate, requireRole(['admin','manager']), handler)

const requireRole = (allowedRoles) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated.' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${roles.join(' or ')}.`,
                yourRole: req.user.role,
            });
        }
        next();
    };
};

// ---- getSubordinateIds ------------------------------------------------------
// Returns all employee IDs that a given manager can access (recursive).
//
// EXAMPLE ORG CHART:
//   Alice (id:1) -> Bob (id:2) -> Carol (id:3) -> Dave (id:4)
//   getSubordinateIds(1) returns [2, 3, 4]
//   getSubordinateIds(2) returns [3, 4]
//
// Uses MySQL 8 recursive CTE - works to any depth.
//
// USAGE IN ROUTES:
//   if (req.user.role === 'manager') {
//     const ids = await getSubordinateIds(req.user.employee_id);
//     // WHERE employee_id IN (...)
//   }

const getSubordinateIds = async (managerEmployeeId) => {
    if (!managerEmployeeId) return [];

    const [rows] = await pool.execute(`
        WITH RECURSIVE subordinates AS (
            -- Base case: direct reports of this manager
            SELECT id
            FROM   employees
            WHERE  manager_id = ?
              AND  is_active   = TRUE

            UNION ALL

            -- Recursive: reports of reports (any depth)
            SELECT e.id
            FROM   employees e
            INNER JOIN subordinates s ON e.manager_id = s.id
            WHERE  e.is_active = TRUE
        )
        SELECT id FROM subordinates
    `, [managerEmployeeId]);

    return rows.map(r => r.id);
};

module.exports = { authenticate, requireRole, getSubordinateIds, clearInvalidationCache };
