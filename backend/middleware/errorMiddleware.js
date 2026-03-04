// backend/middleware/errorMiddleware.js
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Log error (never log in production with stack to client)
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  }

  // MySQL specific errors
  if (err.code) {
    switch (err.code) {
      case 'ER_DUP_ENTRY':
        statusCode = 409;
        message = 'A record with this value already exists';
        break;
      case 'ER_NO_REFERENCED_ROW_2':
        statusCode = 400;
        message = 'Referenced record not found';
        break;
      case 'ER_ROW_IS_REFERENCED_2':
        statusCode = 409;
        message = 'Cannot delete: this record has dependent data';
        break;
      case 'ER_BAD_FIELD_ERROR':
        statusCode = 400;
        message = 'Invalid field referenced';
        break;
      case 'ER_PARSE_ERROR':
        statusCode = 500;
        message = 'Database query error';
        break;
      default:
        if (err.code.startsWith('ER_')) {
          statusCode = 500;
          message = 'Database error';
        }
    }
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors || {}).map(e => e.message).join(', ');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired';
  }

  // CORS errors
  if (err.message && err.message.includes('CORS')) {
    statusCode = 403;
    message = 'Cross-origin request blocked';
  }

  res.status(statusCode).json({
    success: false,
    message,
    // Only expose stack trace in development
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = { errorHandler, notFound };
