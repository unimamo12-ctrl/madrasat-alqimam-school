const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { signToken } = require('../middleware/auth');

const router = express.Router();

function normalizeName(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

// تسجيل دخول التلميذ: الاسم + اللقب + رقم التسجيل
async function loginStudent(req, res) {
  const first = normalizeName(req.body.firstName || req.body.first_name);
  const last = normalizeName(req.body.lastName || req.body.last_name);
  const reg = normalizeName(req.body.regNumber || req.body.reg_number);

  if (!first || !last || !reg) {
    return res.status(400).json({ message: 'يرجى ملء جميع الحقول.' });
  }

  const student = await db.prepare(`
    SELECT s.*, u.username, u.password_hash, u.role, u.active AS user_active
    FROM students s
    JOIN users u ON u.id = s.user_id
    WHERE s.reg_number = ?
  `).get(reg);

  if (!student) {
    return res.status(404).json({ message: 'هذا التلميذ غير مسجل، يرجى التواصل مع الإدارة.' });
  }

  if (student.user_active !== 1 || student.status !== 1) {
    return res.status(403).json({ message: 'حسابك غير مفعل، يرجى التواصل مع الإدارة.' });
  }

  if (normalizeName(student.first_name).toLowerCase() !== first.toLowerCase() ||
      normalizeName(student.last_name).toLowerCase() !== last.toLowerCase()) {
    return res.status(401).json({ message: 'بيانات الدخول غير صحيحة، يرجى التأكد من المعلومات.' });
  }

  const fullName = `${student.first_name} ${student.last_name}`;
  const token = signToken({
    id: student.user_id,
    studentId: student.id,
    role: 'ROLE_STUDENT',
    name: fullName
  });

  res.json({
    token,
    user: {
      id: student.user_id,
      studentId: student.id,
      role: 'ROLE_STUDENT',
      name: fullName,
      firstName: student.first_name,
      lastName: student.last_name,
      regNumber: student.reg_number
    }
  });
}

// تسجيل دخول الإدارة: اسم المستخدم + كلمة المرور
async function loginAdmin(req, res) {
  const username = normalizeName(req.body.username || req.body.userName);
  const password = String(req.body.password || '');

  if (!username || !password) {
    return res.status(400).json({ message: 'يرجى إدخال اسم المستخدم وكلمة المرور.' });
  }

  const user = await db.prepare('SELECT * FROM users WHERE username = ? AND role = ?').get(username, 'ROLE_ADMIN');

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'بيانات الدخول غير صحيحة.' });
  }

  if (user.active !== 1) {
    return res.status(403).json({ message: 'الحساب معطل، يرجى التواصل مع الإدارة.' });
  }

  const token = signToken({ id: user.id, role: 'ROLE_ADMIN', name: 'الإدارة' });

  res.json({
    token,
    user: { id: user.id, role: 'ROLE_ADMIN', name: 'الإدارة', username: user.username }
  });
}

router.post('/student', loginStudent);
router.post('/admin', loginAdmin);

module.exports = router;