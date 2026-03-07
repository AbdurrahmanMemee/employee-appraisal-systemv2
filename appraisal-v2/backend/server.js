// =============================================================================
// FILE:    server.js
// PURPOSE: Main entry point for the Express API server.
//          Loads all middleware, registers all routes, starts listening.
//
// START THE SERVER:
//   Production:  node server.js
//   Development: npm run dev   (uses nodemon for auto-restart on file changes)
//
// ARCHITECTURE — request flow:
//   Request → Security middleware → Rate limiter → CORS → Body parser
//           → Route handler → Response
//           → (on error) → errorHandler → Response
// =============================================================================

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const compression  = require('compression');
const path         = require('path');

// Internal modules
const { pool, testConnection }     = require('./config/database');
const { authenticate }             = require('./middleware/auth');
const { notFound, errorHandler }   = require('./middleware/errorHandler');

// Route files — one per resource
const authRoutes      = require('./routes/auth');
// Phase 3 routes — added one at a time as we build them:
const employeeRoutes  = require('./routes/employees');
const meetingRoutes   = require('./routes/meetings');
const appraisalRoutes = require('./routes/appraisals');
const incidentRoutes  = require('./routes/incidents');
const scheduleRoutes  = require('./routes/schedules');
const configRoutes    = require('./routes/config');
const dashboardRoutes = require('./routes/dashboard');

const app  = express();
const PORT = process.env.PORT || 5001;

// ============================================================================
// MIDDLEWARE — order matters here
// ============================================================================

// 1. Trust the first proxy (required for correct IP addresses on OCI/Ubuntu)
app.set('trust proxy', 1);

// 2. Security headers — helmet sets HTTP headers that protect against common attacks
//    e.g. clickjacking, MIME sniffing, XSS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'"],
      imgSrc:     ["'self'", "data:"],
    },
  },
}));

// 3. Rate limiting — prevents brute force attacks
//    Two limiters: strict for auth routes, relaxed for everything else

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max:      20,               // max 20 login attempts per 15 min per IP
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders:   false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders:   false,
});

app.use('/api/auth', authLimiter);
app.use('/api',      apiLimiter);

// 4. CORS — controls which origins (domains) can call this API
//    In development: allow localhost:3001 (React dev server for v2)
//    In production: only allow the configured FRONTEND_URL
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:3001', 'http://localhost:3000'],
  credentials:     true,
  methods:         ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders:  ['Content-Type', 'Authorization'],
}));

// 5. Body parsing — parse JSON and URL-encoded request bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 6. Compression — gzip responses to reduce bandwidth
app.use(compression());

// 7. Request logging — morgan prints each request to the console
//    'dev' format: GET /api/employees 200 45ms
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));  // more detailed for production logs
}

// 8. Static files — serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================================
// HEALTH CHECK — simple endpoint to confirm the server is running
// ============================================================================

app.get('/health', async (req, res) => {
  try {
    // Test database connection as part of health check
    await pool.execute('SELECT 1');
    res.json({
      success:     true,
      message:     'Server is healthy',
      timestamp:   new Date().toISOString(),
      environment: process.env.NODE_ENV,
      version:     '2.0.0',
    });
  } catch (error) {
    res.status(503).json({
      success:  false,
      message:  'Database unavailable',
      error:    error.message,
    });
  }
});

// ============================================================================
// API ROUTES
// ============================================================================

// Health check — used by monitoring and test scripts
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'OK', timestamp: new Date().toISOString() });
});

// Public — no authentication required
app.use('/api/auth', authRoutes);

// Protected — authentication required (uncommented as each route is built)
app.use('/api/employees',  authenticate, employeeRoutes);
app.use('/api/meetings',   authenticate, meetingRoutes);
app.use('/api/appraisals', authenticate, appraisalRoutes);
app.use('/api/incidents',  authenticate, incidentRoutes);
app.use('/api/schedules',  authenticate, scheduleRoutes);
app.use('/api/config',     authenticate, configRoutes);
app.use('/api/dashboard',  authenticate, dashboardRoutes);

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Employee Appraisal System v2 API',
    version: '2.0.0',
    status:  'Phase 2 — Foundation complete. Routes being added in Phase 3.',
  });
});

// ============================================================================
// ERROR HANDLING — must be registered LAST
// ============================================================================

app.use(notFound);     // handles requests to routes that don't exist
app.use(errorHandler); // handles all errors thrown by route handlers

// ============================================================================
// START SERVER
// ============================================================================

const startServer = async () => {
  // Test database connection before accepting requests
  const dbConnected = await testConnection();

  if (!dbConnected) {
    console.error('❌  Cannot start server — database connection failed.');
    console.error('    Check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log(` EAS v2 Backend — Started`);
    console.log('========================================');
    console.log(` Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(` Port        : ${PORT}`);
    console.log(` Health      : http://localhost:${PORT}/health`);
    console.log(` API         : http://localhost:${PORT}/api`);
    console.log('========================================');
    console.log('');
  });

  // ---- Graceful shutdown ----------------------------------------------------
  // When the server receives a shutdown signal (e.g. Ctrl+C, system restart),
  // finish processing current requests before closing.

  const shutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      console.log('HTTP server closed.');
      await pool.end();
      console.log('Database pool closed.');
      console.log('Goodbye.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
};

startServer();
