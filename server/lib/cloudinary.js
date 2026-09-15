const cloudinary = require('cloudinary').v2;

let configured = false;
let cloudName = null;

function configureFromEnv() {
  const url = process.env.CLOUDINARY_URL || process.env.UPLOAD_CLOUDINARY_URL;
  if (!url) return;
  cloudinary.config({ secure: true });
  configured = true;
  // Extract cloud name from URL: cloudinary://key:secret@cloudname
  const match = url.match(/@([^/]+)/);
  cloudName = match ? match[1] : null;
}

function isConfigured() {
  if (!configured) configureFromEnv();
  return configured && !!cloudName;
}

function getCloudName() {
  if (!configured) configureFromEnv();
  return cloudName;
}

function uploadBuffer(buffer, publicId, options = {}) {
  return new Promise((resolve, reject) => {
    const params = {
      resource_type: 'image',
      folder: 'school',
      public_id: publicId,
      overwrite: true,
      transformation: [{ quality: 'auto' }, { fetch_format: 'auto' }],
      ...options
    };
    const stream = cloudinary.uploader.upload_stream(params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

function getOptimizedUrl(publicId) {
  if (!publicId) return null;
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto/${publicId}`;
}

function getOriginalUrl(publicId) {
  if (!publicId) return null;
  return `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`;
}

async function deleteAsset(publicId) {
  if (!publicId) return null;
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    return result;
  } catch (err) {
    console.error('[CLOUDINARY] delete error:', err.message);
    return null;
  }
}

// Convert local /uploads/filename path to cloud public_id
function pathToPublicId(filePath) {
  if (!filePath || !filePath.startsWith('/uploads/')) return null;
  const name = filePath.replace('/uploads/', '').replace(/\.[^.]+$/, '');
  return name.startsWith('school/') ? name : `school/${name}`;
}

module.exports = { isConfigured, getCloudName, configureFromEnv, uploadBuffer, getOptimizedUrl, getOriginalUrl, deleteAsset, pathToPublicId, get cloudinaryInstance() { return cloudinary; } };
