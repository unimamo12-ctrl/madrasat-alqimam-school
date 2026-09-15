const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cloud = require('../lib/cloudinary');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// Disk storage (used when Cloudinary not configured)
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `teacher-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, name);
  }
});

function fileFilter(req, file, cb) {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) return cb(new Error('صيغة الصورة غير مدعومة (JPG/PNG/WEBP/GIF فقط).'));
  cb(null, true);
}

// Always use memoryStorage; upload to Cloudinary or fall back to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter
});

// After multer, upload to Cloudinary and attach public_id to req.files[].cloudPublicId
// For single file: upload.single('photo')
// For array: upload.array('images', 10)
// Then call resolveUploads(req) before using file paths.

function resolveFileName(req) {
  const files = [];
  if (req.file) files.push(req.file);
  if (req.files && Array.isArray(req.files)) files.push(...req.files);
  return files;
}

async function resolveUploads(req) {
  const files = resolveFileName(req);
  if (!files.length) return [];

  const results = [];
  for (const f of files) {
    if (cloud.isConfigured()) {
      const baseName = path.basename(f.originalname, path.extname(f.originalname)).replace(/[^a-zA-Z0-9_-]/g, '_');
      const ts = Date.now();
      const rand = Math.round(Math.random() * 1e6);
      const publicId = `school/${baseName}-${ts}-${rand}`;

      try {
        await cloud.uploadBuffer(f.buffer, publicId);
        results.push(`/uploads/${publicId}`);
      } catch (err) {
        console.error('[UPLOAD] cloudinary error:', err.message);
        // fallback: save to disk
        const ext = path.extname(f.originalname).toLowerCase();
        const diskName = `teacher-${ts}-${rand}${ext}`;
        const diskPath = path.join(UPLOAD_DIR, diskName);
        fs.writeFileSync(diskPath, f.buffer);
        results.push(`/uploads/${diskName}`);
      }
    } else {
      const ext = path.extname(f.originalname).toLowerCase();
      const diskName = `teacher-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
      const diskPath = path.join(UPLOAD_DIR, diskName);
      fs.writeFileSync(diskPath, f.buffer);
      results.push(`/uploads/${diskName}`);
    }
  }
  return results;
}

module.exports = { upload, UPLOAD_DIR, PUBLIC_DIR, resolveUploads };
