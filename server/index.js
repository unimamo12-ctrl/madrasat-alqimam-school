require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db/database');
const authRouter = require('./routes/auth.routes');
const studentRouter = require('./routes/student.routes');
const adminRouter = require('./routes/admin.routes');
const { UPLOAD_DIR } = require('./middleware/upload');
const cloud = require('./lib/cloudinary');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// الصور المرفوعة: إعادة توجيه إلى Cloudinary عند تفعيله، وإلا قراءة من القرص
if (cloud.isConfigured()) {
  app.use('/uploads', (req, res, next) => {
    const pid = decodeURIComponent(req.path.replace(/^\/+/, ''));
    if (!pid) return next();
    const url = cloud.getOptimizedUrl(pid);
    if (!url) return next();
    res.redirect(301, url);
  });
  console.log('☁️  وضع الصور: Cloudinary');
} else {
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
  console.log('💾 وضع الصور: الملفات المحلية (server/uploads)');
}

// ======================= Routes =======================
app.get('/api/health', (req, res) => res.json({ ok: true, school: 'مدرسة القمم النجاح', db: process.env.DATABASE_URL ? 'postgres' : 'sqlite' }));
app.use('/api/auth', authRouter);
app.use('/api/student', studentRouter);
app.use('/api/admin', adminRouter);

// ======================= 404 + errors =======================
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (require('fs').existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ message: 'الرابط غير موجود.' }));

app.use((err, req, res, next) => {
  if (err && err.message === 'صيغة الصورة غير مدعومة (JPG/PNG/WEBP/GIF فقط).') {
    return res.status(400).json({ message: err.message });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'حجم الصورة يجب أن لا يتجاوز 3 ميغابايت.' });
  }
  console.error('[ERROR]', err);
  res.status(500).json({ message: 'حدث خطأ داخلي في الخادم.' });
});

async function start() {
  await db.init();
  app.listen(PORT, () => {
    const isPg = !!process.env.DATABASE_URL;
    console.log(`✅ مدرسة القمم النجاح - الخادم يعمل على http://localhost:${PORT} [${isPg ? 'PostgreSQL' : 'SQLite'}]`);
    console.log(`   حساب الإدارة: username=admin  password=admin123`);
  });
}

start().catch(err => {
  console.error('[FATAL] تعذر تشغيل الخادم:', err);
  process.exit(1);
});