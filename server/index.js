require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db/database');
const authRouter = require('./routes/auth.routes');
const studentRouter = require('./routes/student.routes');
const adminRouter = require('./routes/admin.routes');
const { UPLOAD_DIR } = require('./middleware/upload');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// الصور المرفوعة
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

// ======================= Routes =======================
app.get('/api/health', (req, res) => res.json({ ok: true, school: 'مدرسة القمم النجاح' }));
app.use('/api/auth', authRouter);
app.use('/api/student', studentRouter);
app.use('/api/admin', adminRouter);

// ======================= 404 + errors =======================
// تقديم الواجهة الجاهزة في الإنتاج
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

app.listen(PORT, () => {
  const students = db.prepare('SELECT COUNT(*) AS c FROM students').get().c;
  const teachers = db.prepare('SELECT COUNT(*) AS c FROM teachers').get().c;
  console.log(`✅ مدرسة القمم النجاح - الخادم يعمل على http://localhost:${PORT}`);
  console.log(`   التلاميذ: ${students} | الأساتذة: ${teachers}`);
  console.log(`   حساب الإدارة: username=admin  password=admin123`);
});