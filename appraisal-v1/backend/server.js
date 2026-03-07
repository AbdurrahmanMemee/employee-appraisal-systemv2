// backend/server.js - Main Express Server for Employee Appraisal System
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const path = require('path');

// Import routes
const employeeRoutes = require('./routes/employees');
const meetingRoutes = require('./routes/meetings');
const appraisalRoutes = require('./routes/appraisals');
const incidentRoutes = require('./routes/incidents');
const scheduleRoutes = require('./routes/schedules');
const configRoutes = require('./routes/config');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const { authenticate } = require('./middleware/authMiddleware');

// Import database connection
const { pool: db } = require('./config/database');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// ============ MIDDLEWARE ============

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"]
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60 * 1000
  }
});
app.use('/api', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Static files (for file uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============ DATABASE CONNECTION TEST ============
app.use(async (req, res, next) => {
  try {
    await db.execute('SELECT 1');
    next();
  } catch (error) {
    console.error('Database connection failed:', error);
    res.status(503).json({ 
      success: false, 
      message: 'Database service unavailable' 
    });
  }
});

// ============ HEALTH CHECK ============
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await db.execute('SELECT 1');
    
    res.json({
      success: true,
      message: 'Server is healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Server health check failed',
      error: error.message
    });
  }
});

// ============ API ROUTES ============

// Public routes (no authentication required)
app.use('/api/auth', authRoutes);

// Protected routes (authentication required)
app.use('/api/employees', authenticate, employeeRoutes);
app.use('/api/meetings', authenticate, meetingRoutes);
app.use('/api/appraisals', authenticate, appraisalRoutes);
app.use('/api/incidents', authenticate, incidentRoutes);
app.use('/api/schedules', authenticate, scheduleRoutes);
app.use('/api/config', authenticate, configRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Employee Appraisal System API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      employees: '/api/employees',
      meetings: '/api/meetings',
      appraisals: '/api/appraisals',
      incidents: '/api/incidents',
      schedules: '/api/schedules',
      config: '/api/config',
      dashboard: '/api/dashboard'
    },
    documentation: '/api/docs'
  });
});

// ============ SERVE REACT APP IN PRODUCTION ============
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build/index.html'));
  });
}

// ============ ERROR HANDLING ============
app.use(notFound);
app.use(errorHandler);

// ============ GRACEFUL SHUTDOWN ============
const gracefulShutdown = async () => {
  console.log('\nReceived shutdown signal. Shutting down gracefully...');
  
  try {
    // Close database connection
    await db.end();
    console.log('Database connection closed.');
    
    // Close server
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

// ============ START SERVER ============
const server = app.listen(PORT, () => {
  console.log(`
🚀 Employee Appraisal System API Server Started
📍 Environment: ${process.env.NODE_ENV || 'development'}
🌐 Server: http://localhost:${PORT}
📖 API Docs: http://localhost:${PORT}/api
🏥 Health Check: http://localhost:${PORT}/health
🗄️  Database: MySQL ${process.env.DB_HOST}:${process.env.DB_PORT}
  `);
});

module.exports = app;