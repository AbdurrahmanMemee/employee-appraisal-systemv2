// =============================================================================
// FILE:    middleware/errorHandler.js
// PURPOSE: Centralised error handling for the Express application.
//
// WHY CENTRALISED ERROR HANDLING?
//   Without this, every route would need its own try/catch and error response
//   code. That leads to inconsistent error formats and duplicated code.
//   Instead, routes just throw errors and this middleware catches everything,
//   formats it consistently, and sends the response.
//
// HOW IT WORKS:
//   Express recognises a middleware with 4 parameters (err, req, res, next)
//   as an error handler. It must be registered LAST in server.js.
//   When any route calls next(error) or throws inside asyncHandler,
//   Express skips all normal middleware and jumps straight here.
//
// EXPORTS:
//   asyncHandler   — wraps async route handlers to catch thrown errors
//   notFound       — 404 handler for routes that don't exist
//   errorHandler   — the main error response formatter
// =============================================================================

// ---- asyncHandler -----------------------------------------------------------
// Wraps an async route function so we don't need try/catch in every route.
//
// WITHOUT asyncHandler:
//   router.get('/employees', async (req, res) => {
//     try {
//       const data = await getEmployees();
//       res.json(data);
//     } catch (error) {
//       next(error);  // must remember to call next(error)
//     }
//   });
//
// WITH asyncHandler:
//   router.get('/employees', asyncHandler(async (req, res) => {
//     const data = await getEmployees();
//     res.json(data);   // any thrown error is automatically forwarded to errorHandler
//   }));

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ---- notFound ---------------------------------------------------------------
// Catches requests to routes that don't exist.
// Registered BEFORE errorHandler but AFTER all real routes in server.js.

const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

// ---- errorHandler -----------------------------------------------------------
// The main error formatter. All errors end up here.
// Returns a consistent JSON structure so the frontend always knows what to expect.
//
// Response format:
//   {
//     success: false,
//     message: "Human readable message",
//     ...(development only: stack trace)
//   }

const errorHandler = (err, req, res, next) => {
  // Determine the HTTP status code
  // Use the error's statusCode if set, otherwise default to 500
  const statusCode = err.statusCode || err.status || 500;

  // Log the error on the server (always log 500s, only log others in development)
  if (statusCode >= 500) {
    console.error(`❌  [${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.error(`    Status: ${statusCode}`);
    console.error(`    Error: ${err.message}`);
    console.error(`    Stack: ${err.stack}`);
  } else if (process.env.NODE_ENV === 'development') {
    console.warn(`⚠️   [${statusCode}] ${req.method} ${req.originalUrl}: ${err.message}`);
  }

  // Build the response object
  const response = {
    success: false,
    message: err.message || 'An unexpected error occurred.',
  };

  // In development, include the stack trace so debugging is easier
  // In production, never expose stack traces to clients
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  // Handle specific MySQL error codes with friendly messages
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      message: 'A record with this value already exists.',
      code: 'DUPLICATE_ENTRY',
    });
  }

  if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({
      success: false,
      message: 'Cannot delete this record because other records depend on it.',
      code: 'REFERENCE_CONSTRAINT',
    });
  }

  res.status(statusCode).json(response);
};

module.exports = { asyncHandler, notFound, errorHandler };
