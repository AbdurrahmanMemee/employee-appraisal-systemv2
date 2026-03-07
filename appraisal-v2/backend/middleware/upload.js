// =============================================================================
// FILE:    middleware/upload.js
// PURPOSE: Multer configuration for PDF meeting attachments.
//
// USAGE IN ROUTES:
//   const { uploadPdf, handleUploadError } = require('../middleware/upload');
//
//   router.post('/', authenticate, uploadPdf, handleUploadError, asyncHandler(...))
//   router.put('/:id/attachment', authenticate, uploadPdf, handleUploadError, asyncHandler(...))
//
// UPLOADED FILE:
//   Available as req.file after successful upload.
//   req.file.path  — absolute path on server  e.g. /var/www/appraisal-v2/backend/uploads/meetings/2026-03/abc123.pdf
//   req.file.filename — stored filename
//   If no file uploaded, req.file is undefined (attachment is optional).
//
// STORAGE:
//   Files saved to: uploads/meetings/YYYY-MM/  (auto-created monthly subfolders)
//   Filenames:      <timestamp>-<random>.pdf
//   Max size:       10 MB
//   Allowed types:  PDF only
// =============================================================================

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ---- Storage config ---------------------------------------------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Organise into monthly subfolders to keep directory sizes manageable
        const now    = new Date();
        const month  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const dir    = path.join(__dirname, '..', 'uploads', 'meetings', month);

        // Create folder if it doesn't exist
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },

    filename: (req, file, cb) => {
        // Timestamp + random suffix — never exposes original filename in storage
        const timestamp = Date.now();
        const random    = Math.random().toString(36).substr(2, 8);
        cb(null, `${timestamp}-${random}.pdf`);
    },
});

// ---- File filter ------------------------------------------------------------
const fileFilter = (req, file, cb) => {
    // Accept only PDF files — check both mimetype and extension
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt  = path.extname(file.originalname).toLowerCase() === '.pdf';

    if (isPdfMime && isPdfExt) {
        cb(null, true);  // accept
    } else {
        cb(new Error('INVALID_FILE_TYPE'), false);  // reject
    }
};

// ---- Multer instance --------------------------------------------------------
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024,  // 10 MB
        files:    1,                  // one file per request
    },
});

// ---- Exported middleware -----------------------------------------------------

// uploadPdf: handles a single optional file field named 'attachment'
// If no file is sent, req.file will be undefined — that's fine, attachment is optional
const uploadPdf = upload.single('attachment');

// handleUploadError: catches multer errors and converts them to clean JSON responses
// Must come immediately after uploadPdf in the route chain
const handleUploadError = (err, req, res, next) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'File too large. Maximum size is 10 MB.',
        });
    }

    if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({
            success: false,
            message: 'Invalid file type. Only PDF files are accepted.',
        });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
            success: false,
            message: 'Unexpected file field. Use field name "attachment".',
        });
    }

    // Unknown multer error — pass to global error handler
    next(err);
};

// deleteUploadedFile: utility to clean up an uploaded file if the DB insert fails
// Prevents orphaned files on the server
const deleteUploadedFile = (filePath) => {
    if (!filePath) return;
    fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error('Failed to delete uploaded file:', filePath, err.message);
        }
    });
};

// buildAttachmentPath: converts absolute server path to a relative URL path
// stored in the DB and served via /uploads static route
const buildAttachmentPath = (absolutePath) => {
    if (!absolutePath) return null;
    // Convert /var/www/appraisal-v2/backend/uploads/meetings/2026-03/file.pdf
    // to      /uploads/meetings/2026-03/file.pdf
    const uploadsIndex = absolutePath.indexOf('/uploads/');
    return uploadsIndex >= 0 ? absolutePath.substring(uploadsIndex) : null;
};

module.exports = { uploadPdf, handleUploadError, deleteUploadedFile, buildAttachmentPath };
