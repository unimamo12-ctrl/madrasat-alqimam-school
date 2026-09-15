const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { upload, UPLOAD_DIR } = require('../middleware/upload');

const router = express.Router();
router.use(authenticate, requireRole('ROLE_ADMIN'));

const MONTHS = ['سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر', 'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي'];
const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

function validateGroupBody(b) {
  const errors = [];
  if (!b.teacher_id) errors.push('الأستاذ مطلوب');
  if (!b.name || !String(b.name).trim()) errors.push('اسم الفوج مطلوب');
  if (!b.day || !DAYS.includes(b.day)) errors.push('اليوم غير صحيح');
  if (!b.start_time) errors.push('وقت البداية مطلوب');
  if (!b.end_time) errors.push('وقت النهاية مطلوب');
  if (!b.capacity || Number(b.capacity) < 1) errors.push('عدد المقاعد يجب أن يكون أكبر من 0');
  return errors;
}

// ======================= Dashboard =======================
router.get('/stats', (req, res) => {
  const stat = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM students) AS students,
      (SELECT COUNT(*) FROM teachers) AS teachers,
      (SELECT COUNT(*) FROM groups) AS groups,
      (SELECT COUNT(*) FROM student_group_selections) AS selections
  `).get();

  const studentsWithoutSelection = db.prepare(`
    SELECT COUNT(*) AS c FROM students s
    WHERE NOT EXISTS (SELECT 1 FROM student_group_selections sg WHERE sg.student_id = s.id)
  `).get().c;

  // المسدد: سجّل دفعة واحدة على الأقل لكل الشهور التسعة
  const studentsRod = db.prepare(`
    SELECT COUNT(*) AS c FROM students s
    WHERE (SELECT COUNT(*) FROM payments p WHERE p.student_id = s.id AND p.is_paid = 1) = 9
  `).get().c;
  const totalStudents = stat.students;
  const studentsNotPaid = totalStudents - studentsRod;

  const monthlyChart = MONTHS.map((m, i) => ({
    month: m,
    paid: db.prepare('SELECT COUNT(*) AS c FROM payments WHERE month_index = ? AND is_paid = 1').get(i).c
  }));

  const levelChart = db.prepare(`
    SELECT l.name, COUNT(s.id) AS count FROM levels l
    LEFT JOIN students s ON s.level_id = l.id
    GROUP BY l.id ORDER BY l.sort_order
  `).all();

  const groupCapacity = db.prepare(`
    SELECT g.name AS name, g.capacity, COUNT(sg.id) AS occupied
    FROM groups g LEFT JOIN student_group_selections sg ON sg.group_id = g.id
    GROUP BY g.id ORDER BY g.name
  `).all();

  res.json({
    stats: { ...stat, studentsWithoutSelection, studentsRod, studentsNotPaid },
    monthlyChart,
    levelChart,
    groupCapacity
  });
});

// ======================= التلاميذ =======================
router.get('/students', (req, res) => {
  const { q, level_id, class_id, status } = req.query;
  let sql = `
    SELECT s.id, s.first_name, s.last_name, s.reg_number, s.phone, s.status,
           l.name AS level_name, c.name AS class_name, ay.name AS year_name,
           (SELECT COUNT(*) FROM student_group_selections sg WHERE sg.student_id = s.id) AS selections_count
    FROM students s
    JOIN levels l ON l.id = s.level_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN academic_years ay ON ay.id = s.academic_year_id
    WHERE 1=1`;
  const params = [];
  if (q) {
    sql += ` AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.reg_number LIKE ? OR s.phone LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (level_id) { sql += ' AND s.level_id = ?'; params.push(Number(level_id)); }
  if (class_id) { sql += ' AND s.class_id = ?'; params.push(Number(class_id)); }
  if (status !== undefined && status !== '') { sql += ' AND s.status = ?'; params.push(Number(status)); }
  sql += ' ORDER BY s.last_name, s.first_name';
  res.json({ students: db.prepare(sql).all(...params) });
});

function createStudentRecord({ first_name, last_name, reg_number, phone, level_id, class_id, academic_year_id, status }) {
  const errors = [];
  if (!first_name || !String(first_name).trim()) errors.push('الاسم مطلوب');
  if (!last_name || !String(last_name).trim()) errors.push('اللقب مطلوب');
  if (!reg_number || !String(reg_number).trim()) errors.push('رقم التسجيل مطلوب');
  if (!level_id) errors.push('المستوى مطلوب');
  if (errors.length) throw { status: 400, message: errors.join('، ') };

  const dup = db.prepare('SELECT id FROM students WHERE reg_number = ?').get(reg_number.trim());
  if (dup) throw { status: 409, message: 'رقم التسجيل مستخدم مسبقاً.' };

  const tx = db.transaction(() => {
    const ph = bcrypt.hashSync(String(Math.random()).slice(2), 6);
    const user = db.prepare('INSERT INTO users (username, password_hash, role, active) VALUES (?, ?, ?, ?)')
      .run(reg_number.trim(), ph, 'ROLE_STUDENT', status ? 1 : 0);
    const s = db.prepare(`
      INSERT INTO students (user_id, first_name, last_name, reg_number, phone, level_id, class_id, academic_year_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user.lastInsertRowid, first_name.trim(), last_name.trim(), reg_number.trim(),
           phone ? String(phone).trim() : null, Number(level_id),
           class_id ? Number(class_id) : null, academic_year_id ? Number(academic_year_id) : null, status ? 1 : 0);
    return s.lastInsertRowid;
  });
  try { tx(); } catch (e) { if (e.status) throw e; throw { status: 500, message: e.message }; }
}

router.post('/students', (req, res) => {
  try {
    createStudentRecord(req.body);
    return res.status(201).json({ message: 'تمت إضافة التلميذ بنجاح.' });
  } catch (e) {
    // only reg number duplicates produce a typed error from createStudentRecord;
    // other constraint errors are wrapped below
    if (e.status) return res.status(e.status).json({ message: e.message });
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ message: 'رقم التسجيل مستخدم مسبقاً.' });
    return res.status(400).json({ message: e.message });
  }
});

router.put('/students/:id', (req, res) => {
  const id = Number(req.params.id);
  const { first_name, last_name, reg_number, phone, level_id, class_id, academic_year_id, status } = req.body;
  const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ message: 'التلميذ غير موجود.' });
  if (!first_name || !last_name || !reg_number || !level_id) {
    return res.status(400).json({ message: 'يرجى ملء جميع الحقول الإلزامية.' });
  }
  const dup = db.prepare('SELECT id FROM students WHERE reg_number = ? AND id <> ?').get(reg_number.trim(), id);
  if (dup) return res.status(409).json({ message: 'رقم التسجيل مستخدم مسبقاً.' });

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE students SET first_name=?, last_name=?, reg_number=?, phone=?, level_id=?, class_id=?, academic_year_id=?, status=?
      WHERE id=?
    `).run(first_name.trim(), last_name.trim(), reg_number.trim(), phone ? String(phone).trim() : null,
           Number(level_id), class_id ? Number(class_id) : null, academic_year_id ? Number(academic_year_id) : null,
           status ? 1 : 0, id);
    db.prepare('UPDATE users SET username=?, active=? WHERE id=?')
      .run(reg_number.trim(), status ? 1 : 0, existing.user_id);
  });
  tx();
  res.json({ message: 'تم تحديث بيانات التلميذ بنجاح.' });
});

router.patch('/students/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const status = req.body.status ? 1 : 0;
  const s = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!s) return res.status(404).json({ message: 'التلميذ غير موجود.' });
  const tx = db.transaction(() => {
    db.prepare('UPDATE students SET status=? WHERE id=?').run(status, id);
    db.prepare('UPDATE users SET active=? WHERE id=?').run(status, s.user_id);
  });
  tx();
  res.json({ message: status ? 'تم تفعيل الحساب.' : 'تم تعطيل الحساب.' });
});

router.delete('/students/:id', (req, res) => {
  const id = Number(req.params.id);
  const s = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!s) return res.status(404).json({ message: 'التلميذ غير موجود.' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM payments WHERE student_id = ?').run(id);
    db.prepare('DELETE FROM student_group_selections WHERE student_id = ?').run(id);
    db.prepare('DELETE FROM students WHERE id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(s.user_id);
  });
  tx();
  res.json({ message: 'تم حذف التلميذ نهائياً.' });
});

// ======================= الأساتذة =======================
router.get('/teachers', (req, res) => {
  const { q, subject_id, level_id, class_id } = req.query;
  let sql = `
    SELECT t.id, t.first_name, t.last_name, t.photo, t.subject_id, t.status,
           sub.name AS subject_name,
           (SELECT COUNT(*) FROM groups g WHERE g.teacher_id = t.id) AS groups_count
    FROM teachers t JOIN subjects sub ON sub.id = t.subject_id
    WHERE 1=1`;
  const params = [];
  if (q) { sql += ' AND (t.first_name LIKE ? OR t.last_name LIKE ?)'; const like = `%${q}%`; params.push(like, like); }
  if (subject_id) { sql += ' AND t.subject_id = ?'; params.push(Number(subject_id)); }
  if (level_id) {
    sql += ' AND EXISTS (SELECT 1 FROM teacher_levels tl WHERE tl.teacher_id=t.id AND tl.level_id=?)';
    params.push(Number(level_id));
  }
  if (class_id) {
    sql += ' AND EXISTS (SELECT 1 FROM teacher_classes tc WHERE tc.teacher_id=t.id AND tc.class_id=?)';
    params.push(Number(class_id));
  }
  sql += ' ORDER BY t.last_name, t.first_name';
  const teachers = db.prepare(sql).all(...params).map(t => ({
    ...t,
    levels: db.prepare('SELECT l.id, l.name FROM teacher_levels tl JOIN levels l ON l.id=tl.level_id WHERE tl.teacher_id=? ORDER BY l.sort_order').all(t.id),
    classes: db.prepare('SELECT c.id, c.name FROM teacher_classes tc JOIN classes c ON c.id=tc.class_id WHERE tc.teacher_id=? ORDER BY c.id').all(t.id)
  }));
  res.json({ teachers });
});

router.post('/teachers', upload.single('photo'), (req, res) => {
  const { first_name, last_name, subject_id, status } = req.body;
  const levels = JSON.parse(req.body.levels || '[]');
  const classes = JSON.parse(req.body.classes || '[]');
  if (!first_name || !last_name || !subject_id) return res.status(400).json({ message: 'الاسم واللقب والمادة مطلوبة.' });
  if (!levels.length || !classes.length) return res.status(400).json({ message: 'حدد المستويات والشعب التي يدرسها الأستاذ.' });

  const tx = db.transaction(() => {
    const r = db.prepare('INSERT INTO teachers (first_name, last_name, subject_id, photo, status) VALUES (?,?,?,?,?)')
      .run(first_name.trim(), last_name.trim(), Number(subject_id), req.file ? `/uploads/${req.file.filename}` : null, status ? 1 : 0);
    const tid = r.lastInsertRowid;
    const il = db.prepare('INSERT INTO teacher_levels (teacher_id, level_id) VALUES (?,?)');
    levels.forEach(l => il.run(tid, Number(l)));
    const ic = db.prepare('INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?,?)');
    classes.forEach(c => ic.run(tid, Number(c)));
    return tid;
  });
  const id = tx();
  res.status(201).json({ message: 'تمت إضافة الأستاذ بنجاح.', id });
});

router.put('/teachers/:id', upload.single('photo'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM teachers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ message: 'الأستاذ غير موجود.' });
  const { first_name, last_name, subject_id, status } = req.body;
  let levels = []; let classes = [];
  try { levels = JSON.parse(req.body.levels || '[]'); } catch (e) { levels = []; }
  try { classes = JSON.parse(req.body.classes || '[]'); } catch (e) { classes = []; }
  if (!first_name || !last_name || !subject_id) return res.status(400).json({ message: 'الاسم واللقب والمادة مطلوبة.' });

  const photo = req.file ? `/uploads/${req.file.filename}` : existing.photo;
  const tx = db.transaction(() => {
    db.prepare('UPDATE teachers SET first_name=?, last_name=?, subject_id=?, photo=?, status=? WHERE id=?')
      .run(first_name.trim(), last_name.trim(), Number(subject_id), photo, status ? 1 : 0, id);
    db.prepare('DELETE FROM teacher_levels WHERE teacher_id=?').run(id);
    db.prepare('DELETE FROM teacher_classes WHERE teacher_id=?').run(id);
    const il = db.prepare('INSERT INTO teacher_levels (teacher_id, level_id) VALUES (?,?)');
    levels.forEach(l => il.run(id, Number(l)));
    const ic = db.prepare('INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?,?)');
    classes.forEach(c => ic.run(id, Number(c)));
  });
  tx();
  res.json({ message: 'تم تحديث بيانات الأستاذ بنجاح.' });
});

router.patch('/teachers/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const status = req.body.status ? 1 : 0;
  if (!db.prepare('SELECT id FROM teachers WHERE id=?').get(id)) return res.status(404).json({ message: 'الأستاذ غير موجود.' });
  db.prepare('UPDATE teachers SET status=? WHERE id=?').run(status, id);
  res.json({ message: status ? 'تم تفعيل الأستاذ.' : 'تم تعطيل الأستاذ.' });
});

router.delete('/teachers/:id', (req, res) => {
  const id = Number(req.params.id);
  const used = db.prepare('SELECT COUNT(*) AS c FROM groups WHERE teacher_id=?').get(id).c;
  if (used > 0) return res.status(409).json({ message: 'لا يمكن حذف الأستاذ لأنه مرتبط بأفواج، احذف الأفواج أولاً.' });
  db.prepare('DELETE FROM teachers WHERE id=?').run(id);
  res.json({ message: 'تم حذف الأستاذ.' });
});

// ======================= المواد / المستويات / الشعب =======================
router.get('/subjects', (req, res) => res.json({ subjects: db.prepare('SELECT * FROM subjects ORDER BY name').all() }));
router.post('/subjects', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'اسم المادة مطلوب.' });
  try { db.prepare('INSERT INTO subjects (name) VALUES (?)').run(name); res.status(201).json({ message: 'تمت الإضافة.' }); }
  catch (e) { res.status(409).json({ message: 'المادة موجودة مسبقاً.' }); }
});
router.put('/subjects/:id', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'اسم المادة مطلوب.' });
  try { db.prepare('UPDATE subjects SET name=? WHERE id=?').run(name, Number(req.params.id)); res.json({ message: 'تم التعديل.' }); }
  catch (e) { res.status(409).json({ message: 'المادة موجودة مسبقاً.' }); }
});
router.delete('/subjects/:id', (req, res) => {
  const id = Number(req.params.id);
  const used = db.prepare('SELECT 1 FROM teachers WHERE subject_id=? LIMIT 1').get(id);
  const usedG = db.prepare('SELECT 1 FROM groups WHERE subject_id=? LIMIT 1').get(id);
  if (used || usedG) return res.status(409).json({ message: 'لا يمكن حذف مادة مرتبطة بأساتذة أو أفواج.' });
  db.prepare('DELETE FROM subjects WHERE id=?').run(id);
  res.json({ message: 'تم الحذف.' });
});

router.get('/levels', (req, res) => {
  const levels = db.prepare('SELECT * FROM levels ORDER BY sort_order').all();
  res.json({ levels });
});
router.post('/levels', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'اسم المستوى مطلوب.' });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM levels').get().m;
  try { db.prepare('INSERT INTO levels (name, sort_order) VALUES (?,?)').run(name, max + 1); res.status(201).json({ message: 'تمت الإضافة.' }); }
  catch (e) { res.status(409).json({ message: 'المستوى موجود مسبقاً.' }); }
});
router.put('/levels/:id', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'اسم المستوى مطلوب.' });
  try { db.prepare('UPDATE levels SET name=? WHERE id=?').run(name, Number(req.params.id)); res.json({ message: 'تم التعديل.' }); }
  catch (e) { res.status(409).json({ message: 'المستوى موجود مسبقاً.' }); }
});
router.delete('/levels/:id', (req, res) => {
  const id = Number(req.params.id);
  const n = db.prepare(`
    SELECT (SELECT COUNT(*) FROM students WHERE level_id=?) +
           (SELECT COUNT(*) FROM groups WHERE level_id=?) AS c
  `).get(id, id).c;
  if (n > 0) return res.status(409).json({ message: 'لا يمكن حذف مستوى مرتبط بتلاميذ أو أفواج.' });
  db.prepare('DELETE FROM levels WHERE id=?').run(id);
  res.json({ message: 'تم الحذف.' });
});

router.get('/classes', (req, res) => {
  const { level_id } = req.query;
  let sql = 'SELECT c.id, c.name, c.level_id, l.name AS level_name FROM classes c JOIN levels l ON l.id=c.level_id WHERE 1=1';
  const params = [];
  if (level_id) { sql += ' AND c.level_id = ?'; params.push(Number(level_id)); }
  sql += ' ORDER BY l.sort_order, c.sort_order';
  res.json({ classes: db.prepare(sql).all(...params) });
});
router.post('/classes', (req, res) => {
  const { name, level_id } = req.body;
  if (!name || !level_id) return res.status(400).json({ message: 'الاسم والمستوى مطلوبان.' });
  try { db.prepare('INSERT INTO classes (name, level_id, sort_order) VALUES (?,?,0)').run(name.trim(), Number(level_id)); res.status(201).json({ message: 'تمت الإضافة.' }); }
  catch (e) { res.status(409).json({ message: 'الشعبة موجودة في هذا المستوى مسبقاً.' }); }
});
router.put('/classes/:id', (req, res) => {
  const { name, level_id } = req.body;
  if (!name || !level_id) return res.status(400).json({ message: 'الاسم والمستوى مطلوبان.' });
  try { db.prepare('UPDATE classes SET name=?, level_id=? WHERE id=?').run(name.trim(), Number(level_id), Number(req.params.id)); res.json({ message: 'تم التعديل.' }); }
  catch (e) { res.status(409).json({ message: 'الشعبة موجودة في هذا المستوى مسبقاً.' }); }
});
router.delete('/classes/:id', (req, res) => {
  const id = Number(req.params.id);
  const n = db.prepare('SELECT (SELECT COUNT(*) FROM students WHERE class_id=?)+(SELECT COUNT(*) FROM groups WHERE class_id=?) AS c').get(id, id).c;
  if (n > 0) return res.status(409).json({ message: 'لا يمكن حذف شعبة مرتبطة بتلاميذ أو أفواج.' });
  db.prepare('DELETE FROM classes WHERE id=?').run(id);
  res.json({ message: 'تم الحذف.' });
});

// ======================= الأفواج =======================
router.get('/groups', (req, res) => {
  const { teacher_id, level_id, class_id } = req.query;
  let sql = `
    SELECT g.id, g.name, g.day, g.start_time, g.end_time, g.capacity, g.status, g.teacher_id, g.subject_id,
           t.first_name AS tfirst, t.last_name AS tlast, sub.name AS subject_name,
           l.name AS level_name, c.name AS class_name,
           (SELECT COUNT(*) FROM student_group_selections sg WHERE sg.group_id = g.id) AS occupied
    FROM groups g
    JOIN teachers t ON t.id = g.teacher_id
    JOIN subjects sub ON sub.id = g.subject_id
    JOIN levels l ON l.id = g.level_id
    LEFT JOIN classes c ON c.id = g.class_id
    WHERE 1=1`;
  const params = [];
  if (teacher_id) { sql += ' AND g.teacher_id = ?'; params.push(Number(teacher_id)); }
  if (level_id) { sql += ' AND g.level_id = ?'; params.push(Number(level_id)); }
  if (class_id) { sql += ' AND g.class_id = ?'; params.push(Number(class_id)); }
  sql += ' ORDER BY g.name';
  res.json({ groups: db.prepare(sql).all(...params) });
});

router.post('/groups', (req, res) => {
  const b = req.body;
  const errors = validateGroupBody(b);
  if (errors.length) return res.status(400).json({ message: errors.join('، ') });
  const level = db.prepare('SELECT id FROM levels WHERE id=?').get(Number(b.level_id));
  if (!level) return res.status(400).json({ message: 'المستوى غير صحيح.' });
  const teacher = db.prepare('SELECT * FROM teachers WHERE id=?').get(Number(b.teacher_id));
  if (!teacher) return res.status(400).json({ message: 'الأستاذ غير موجود.' });

  const tx = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO groups (teacher_id, subject_id, level_id, class_id, name, day, start_time, end_time, capacity, status)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(Number(b.teacher_id), teacher.subject_id, Number(b.level_id),
           b.class_id ? Number(b.class_id) : null, b.name.trim(), b.day, b.start_time, b.end_time,
           Number(b.capacity), b.status ? 1 : 0);
    db.prepare('INSERT INTO schedules (group_id, day, start_time, end_time) VALUES (?,?,?,?)')
      .run(r.lastInsertRowid, b.day, b.start_time, b.end_time);
    return r.lastInsertRowid;
  });
  const id = tx();
  res.status(201).json({ message: 'تم إنشاء الفوج بنجاح.', id });
});

router.put('/groups/:id', (req, res) => {
  const id = Number(req.params.id);
  const g = db.prepare('SELECT * FROM groups WHERE id=?').get(id);
  if (!g) return res.status(404).json({ message: 'الفوج غير موجود.' });
  const b = req.body;
  const errors = validateGroupBody(b);
  if (errors.length) return res.status(400).json({ message: errors.join('، ') });
  const teacher = db.prepare('SELECT * FROM teachers WHERE id=?').get(Number(b.teacher_id));
  if (!teacher) return res.status(400).json({ message: 'الأستاذ غير موجود.' });

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE groups SET teacher_id=?, subject_id=?, level_id=?, class_id=?, name=?, day=?, start_time=?, end_time=?, capacity=?, status=?
      WHERE id=?
    `).run(Number(b.teacher_id), teacher.subject_id, Number(b.level_id),
          b.class_id ? Number(b.class_id) : null, b.name.trim(), b.day, b.start_time, b.end_time,
          Number(b.capacity), b.status ? 1 : 0, id);
    db.prepare(`INSERT INTO schedules (group_id, day, start_time, end_time) VALUES (?,?,?,?)
                ON CONFLICT(group_id) DO UPDATE SET day=excluded.day, start_time=excluded.start_time, end_time=excluded.end_time`)
      .run(id, b.day, b.start_time, b.end_time);
  });
  tx();
  res.json({ message: 'تم تحديث الفوج بنجاح.' });
});

router.delete('/groups/:id', (req, res) => {
  const id = Number(req.params.id);
  const sel = db.prepare('SELECT COUNT(*) AS c FROM student_group_selections WHERE group_id=?').get(id).c;
  if (sel > 0) return res.status(409).json({ message: 'لا يمكن حذف فوج اختاره تلاميذ. احذف الاختيارات أولاً.' });
  db.prepare('DELETE FROM groups WHERE id=?').run(id);
  res.json({ message: 'تم حذف الفوج.' });
});

// ======================= اختيارات التلاميذ =======================
router.get('/selections', (req, res) => {
  const { q, teacher_id, level_id, class_id, group_id } = req.query;
  let sql = `
    SELECT sg.id AS selection_id, sg.status AS sel_status, sg.group_id,
           s.id AS student_id, s.first_name AS sfirst, s.last_name AS slast, s.reg_number,
           t.id AS teacher_id, t.first_name AS tfirst, t.last_name AS tlast,
           sub.name AS subject_name, g.name AS group_name, g.day, g.start_time, g.end_time,
           l.name AS level_name, c.name AS class_name
    FROM student_group_selections sg
    JOIN students s ON s.id = sg.student_id
    JOIN groups g ON g.id = sg.group_id
    JOIN teachers t ON t.id = g.teacher_id
    JOIN subjects sub ON sub.id = g.subject_id
    JOIN levels l ON l.id = s.level_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE 1=1`;
  const params = [];
  if (q) { sql += ' AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.reg_number LIKE ? OR t.first_name LIKE ? OR t.last_name LIKE ? OR g.name LIKE ?)'; const like = `%${q}%`; params.push(like, like, like, like, like, like); }
  if (teacher_id) { sql += ' AND g.teacher_id = ?'; params.push(Number(teacher_id)); }
  if (level_id) { sql += ' AND s.level_id = ?'; params.push(Number(level_id)); }
  if (class_id) { sql += ' AND s.class_id = ?'; params.push(Number(class_id)); }
  if (group_id) { sql += ' AND g.id = ?'; params.push(Number(group_id)); }
  sql += ' ORDER BY s.last_name, s.first_name';
  res.json({ selections: db.prepare(sql).all(...params) });
});

// نقل التلميذ إلى فوج آخر (الإدارة فقط)
router.put('/selections/:id/move', (req, res) => {
  const id = Number(req.params.id);
  const newGroupId = Number(req.body.group_id);
  const sel = db.prepare(`
    SELECT sg.*, g.teacher_id AS old_teacher, s.status AS student_status
    FROM student_group_selections sg
    JOIN groups g ON g.id = sg.group_id
    JOIN students s ON s.id = sg.student_id
    WHERE sg.id = ?
  `).get(id);
  if (!sel) return res.status(404).json({ message: 'الاختيار غير موجود.' });

  const move = db.transaction(() => {
    const grp = db.prepare(`
      SELECT g.*, t.subject_id AS tsub, t.status AS teacher_status, s.level_id AS slevel, s.class_id AS sclass
      FROM groups g
      JOIN teachers t ON t.id = g.teacher_id
      JOIN students s ON s.id = ?
      WHERE g.id = ?
    `).get(sel.student_id, newGroupId);
    if (!grp || grp.status !== 1 || grp.teacher_status !== 1) throw { status: 400, message: 'الفوج الهدف غير متاح.' };
    // يجب أن يبقى مع نفس الأستاذ
    if (grp.teacher_id !== sel.old_teacher) throw { status: 400, message: 'لا يمكن نقل التلميذ إلى فوج لأستاذ آخر.' };
    // مطابقة المستوى والشعبة
    if (grp.level_id !== grp.slevel || (grp.class_id && grp.class_id !== grp.sclass)) throw { status: 400, message: 'الفوج لا يطابق مستوى التلميذ.' };
    // السعة
    const occ = db.prepare('SELECT COUNT(*) AS c FROM student_group_selections WHERE group_id=? AND id<>?').get(newGroupId, id).c;
    if (occ >= grp.capacity) throw { status: 409, message: 'الفوج الهدف مكتمل.' };
    db.prepare('UPDATE student_group_selections SET group_id=?, teacher_id=?, status=? WHERE id=?')
      .run(newGroupId, grp.teacher_id, 'confirmed', id);
  });
  try { move(); res.json({ message: 'تم نقل التلميذ إلى الفوج الجديد.' }); }
  catch (e) { res.status(e.status || 500).json({ message: e.message || 'خطأ.' }); }
});

router.delete('/selections/:id', (req, res) => {
  const id = Number(req.params.id);
  const sel = db.prepare('SELECT id FROM student_group_selections WHERE id=?').get(id);
  if (!sel) return res.status(404).json({ message: 'الاختيار غير موجود.' });
  db.prepare('DELETE FROM student_group_selections WHERE id=?').run(id);
  res.json({ message: 'تم حذف الاختيار. (أصبح التلميذ حراً في إعادة الاختيار)' });
});

router.post('/selections/:id/reopen', (req, res) => {
  const id = Number(req.params.id);
  const sel = db.prepare('SELECT id FROM student_group_selections WHERE id=?').get(id);
  if (!sel) return res.status(404).json({ message: 'الاختيار غير موجود.' });
  db.prepare('DELETE FROM student_group_selections WHERE id=?').run(id);
  res.json({ message: 'تمت إعادة فتح الاختيار للتلميذ.' });
});

router.patch('/selections/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body.status || 'confirmed');
  db.prepare('UPDATE student_group_selections SET status=? WHERE id=?').run(status, id);
  res.json({ message: 'تم تثبيت الاختيار.' });
});

// قائمة تلاميذ فوج معين
router.get('/groups/:id/students', (req, res) => {
  const gid = Number(req.params.id);
  const students = db.prepare(`
    SELECT s.first_name, s.last_name, s.reg_number, l.name AS level_name, c.name AS class_name
    FROM student_group_selections sg
    JOIN students s ON s.id = sg.student_id
    JOIN levels l ON l.id = s.level_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE sg.group_id = ?
    ORDER BY s.last_name, s.first_name
  `).all(gid);
  res.json({ students });
});

// ======================= الدفع =======================
router.get('/payments', (req, res) => {
  const { q, level_id, class_id, paid_status } = req.query;
  let sql = `
    SELECT s.id AS student_id, s.first_name, s.last_name, s.reg_number,
           l.name AS level_name, c.name AS class_name,
           (SELECT COUNT(*) FROM payments p WHERE p.student_id=s.id AND p.is_paid=1) AS paid_months,
           9 AS total_months
    FROM students s
    JOIN levels l ON l.id = s.level_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE 1=1`;
  const params = [];
  if (q) { sql += ' AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.reg_number LIKE ?)'; const like = `%${q}%`; params.push(like, like, like); }
  if (level_id) { sql += ' AND s.level_id=?'; params.push(Number(level_id)); }
  if (class_id) { sql += ' AND s.class_id=?'; params.push(Number(class_id)); }
  sql += ' ORDER BY s.last_name, s.first_name';
  const students = db.prepare(sql).all(...params);

  const filtered = students.filter(s => {
    if (paid_status === 'paid') return s.paid_months === s.total_months;
    if (paid_status === 'unpaid') return s.paid_months < s.total_months;
    return true;
  }).map(s => ({
    ...s,
    fully_paid: s.paid_months === s.total_months
  }));

  res.json({ students: filtered });
});

router.get('/payments/student/:id', (req, res) => {
  const sid = Number(req.params.id);
  const student = db.prepare(`
    SELECT s.id, s.first_name, s.last_name, s.reg_number, l.name AS level_name, c.name AS class_name
    FROM students s JOIN levels l ON l.id=s.level_id LEFT JOIN classes c ON c.id=s.class_id
    WHERE s.id=?
  `).get(sid);
  if (!student) return res.status(404).json({ message: 'التلميذ غير موجود.' });
  const payments = db.prepare('SELECT * FROM payments WHERE student_id=? ORDER BY month_index').all(sid);
  const rows = MONTHS.map((m, i) => {
    const p = payments.find(x => x.month_index === i);
    return { month: m, month_index: i, payment_date: p ? p.payment_date : null, is_paid: p ? p.is_paid : 0, payment_id: p ? p.id : null };
  });
  res.json({ student, payments: rows });
});

// تسجيل/تعديل دفعة لشهر معين
router.post('/payments/student/:id', (req, res) => {
  const sid = Number(req.params.id);
  const { month_index, payment_date } = req.body;
  const mi = Number(month_index);
  if (isNaN(mi) || mi < 0 || mi > 8) return res.status(400).json({ message: 'الشهر غير صحيح.' });
  if (!payment_date) return res.status(400).json({ message: 'تاريخ الدفع مطلوب.' });
  const student = db.prepare('SELECT id FROM students WHERE id=?').get(sid);
  if (!student) return res.status(404).json({ message: 'التلميذ غير موجود.' });
  db.prepare(`
    INSERT INTO payments (student_id, month_index, payment_date, is_paid, created_by, updated_at)
    VALUES (?,?,?,1,?,datetime('now'))
    ON CONFLICT(student_id, month_index) DO UPDATE SET
      payment_date=excluded.payment_date, is_paid=1, updated_at=datetime('now')
  `).run(sid, mi, payment_date, req.user.id);
  res.json({ message: 'تم تسجيل الدفع بنجاح.' });
});

// تعديل دفعة موجودة
router.put('/payments/:id', (req, res) => {
  const id = Number(req.params.id);
  const { payment_date, is_paid } = req.body;
  const p = db.prepare('SELECT * FROM payments WHERE id=?').get(id);
  if (!p) return res.status(404).json({ message: 'الدفعة غير موجودة.' });
  db.prepare('UPDATE payments SET payment_date=?, is_paid=?, updated_at=datetime(\'now\') WHERE id=?')
    .run(payment_date || null, is_paid ? 1 : 0, id);
  res.json({ message: is_paid ? 'تم تحديث الدفعة.' : 'تم إلغاء الدفعة.' });
});

// إلغاء دفع شهر
router.delete('/payments/:id', (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM payments WHERE id=?').get(id);
  if (!p) return res.status(404).json({ message: 'الدفعة غير موجودة.' });
  db.prepare('UPDATE payments SET is_paid=0, payment_date=NULL WHERE id=?').run(id);
  res.json({ message: 'تم إلغاء الدفع.' });
});

// ======================= الإعلانات =======================
router.get('/announcements', (req, res) => {
  const rows = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC, id DESC').all()
    .map(a => ({ ...a, images: JSON.parse(a.images || '[]') }));
  res.json({ announcements: rows });
});

router.post('/announcements', upload.array('images', 10), (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message && (!req.files || !req.files.length)) {
    return res.status(400).json({ message: 'اكتب نص الإعلان أو ارفع صورة واحدة على الأقل.' });
  }
  const images = (req.files || []).map(f => `/uploads/${f.filename}`);
  const r = db.prepare(`
    INSERT INTO announcements (message, images, status, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).run(message, JSON.stringify(images), req.body.status === undefined || Number(req.body.status) === 1 ? 1 : 0);
  res.status(201).json({ message: 'تم نشر الإعلان.', id: r.lastInsertRowid });
});

router.put('/announcements/:id', upload.array('images', 10), (req, res) => {
  const id = Number(req.params.id);
  const a = db.prepare('SELECT * FROM announcements WHERE id=?').get(id);
  if (!a) return res.status(404).json({ message: 'الإعلان غير موجود.' });

  let images = JSON.parse(a.images || '[]');
  const removed = new Set(JSON.parse(req.body.removed_images || '[]'));
  images = images.filter(img => !removed.has(img));
  if (req.files && req.files.length) {
    images = images.concat(req.files.map(f => `/uploads/${f.filename}`));
  }
  const message = req.body.message !== undefined ? String(req.body.message).trim() : a.message;
  const status = req.body.status === undefined ? a.status : (Number(req.body.status) === 1 ? 1 : 0);
  db.prepare('UPDATE announcements SET message=?, images=?, status=?, updated_at=datetime(\'now\') WHERE id=?')
    .run(message, JSON.stringify(images), status, id);
  res.json({ message: 'تم تحديث الإعلان.' });
});

router.delete('/announcements/:id', (req, res) => {
  const id = Number(req.params.id);
  const a = db.prepare('SELECT * FROM announcements WHERE id=?').get(id);
  if (!a) return res.status(404).json({ message: 'الإعلان غير موجود.' });
  const images = JSON.parse(a.images || '[]');
  images.forEach(img => {
    const name = path.basename(img);
    const abs = path.join(UPLOAD_DIR, name);
    if (fs.existsSync(abs) && name && !/\.\./.test(name)) fs.unlinkSync(abs);
  });
  db.prepare('DELETE FROM announcements WHERE id=?').run(id);
  res.json({ message: 'تم حذف الإعلان.' });
});

// ======================= الجدول الدراسي =======================
router.get('/schedule', (req, res) => {
  const rows = db.prepare(`
    SELECT g.id, g.name AS group_name, g.day, g.start_time, g.end_time,
           t.first_name AS tfirst, t.last_name AS tlast, sub.name AS subject_name,
           l.name AS level_name, c.name AS class_name,
           (SELECT COUNT(*) FROM student_group_selections sg WHERE sg.group_id=g.id) AS occupied
    FROM groups g
    JOIN teachers t ON t.id=g.teacher_id
    JOIN subjects sub ON sub.id=g.subject_id
    JOIN levels l ON l.id=g.level_id
    LEFT JOIN classes c ON c.id=g.class_id
    ORDER BY CASE g.day WHEN 'السبت' THEN 1 WHEN 'الأحد' THEN 2 WHEN 'الاثنين' THEN 3
             WHEN 'الثلاثاء' THEN 4 WHEN 'الأربعاء' THEN 5 WHEN 'الخميس' THEN 6 WHEN 'الجمعة' THEN 7 END,
             g.start_time, g.name
  `).all();
  res.json({ schedule: rows });
});

router.put('/schedule/:id', (req, res) => {
  const gid = Number(req.params.id);
  const { day, start_time, end_time } = req.body;
  if (!day || !start_time || !end_time) return res.status(400).json({ message: 'اليوم والوقت مطلوبان.' });
  const g = db.prepare('SELECT * FROM groups WHERE id=?').get(gid);
  if (!g) return res.status(404).json({ message: 'الفوج غير موجود.' });
  db.prepare('UPDATE groups SET day=?, start_time=?, end_time=? WHERE id=?').run(day, start_time, end_time, gid);
  db.prepare(`INSERT INTO schedules (group_id, day, start_time, end_time) VALUES (?,?,?,?)
              ON CONFLICT(group_id) DO UPDATE SET day=excluded.day, start_time=excluded.start_time, end_time=excluded.end_time`)
    .run(gid, day, start_time, end_time);
  res.json({ message: 'تم تعديل الجدول.' });
});

// ======================= الإعدادات =======================
router.get('/settings', (req, res) => {
  const years = db.prepare('SELECT * FROM academic_years ORDER BY is_active DESC, name DESC').all();
  const admin = db.prepare('SELECT id, username FROM users WHERE id=?').get(req.user.id);
  res.json({ years, admin });
});

router.post('/settings/years', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'اسم السنة مطلوب.' });
  try { db.prepare('INSERT INTO academic_years (name, is_active) VALUES (?,0)').run(name); res.status(201).json({ message: 'تمت إضافة السنة.' }); }
  catch (e) { res.status(409).json({ message: 'السنة موجودة مسبقاً.' }); }
});

router.put('/settings/years/:id/active', (req, res) => {
  const id = Number(req.params.id);
  const year = db.prepare('SELECT * FROM academic_years WHERE id=?').get(id);
  if (!year) return res.status(404).json({ message: 'السنة غير موجودة.' });
  const tx = db.transaction(() => {
    db.prepare('UPDATE academic_years SET is_active=0 WHERE 1=1').run();
    db.prepare('UPDATE academic_years SET is_active=1 WHERE id=?').run(id);
  });
  tx();
  res.json({ message: 'تم تحديد السنة الدراسية النشطة.' });
});

router.get('/settings/options', (req, res) => {
  res.json({
    levels: db.prepare('SELECT * FROM levels ORDER BY sort_order').all(),
    classes: db.prepare('SELECT * FROM classes ORDER BY level_id, sort_order').all(),
    subjects: db.prepare('SELECT * FROM subjects ORDER BY name').all(),
    years: db.prepare('SELECT * FROM academic_years ORDER BY is_active DESC, name DESC').all(),
    teachers: db.prepare('SELECT id, first_name, last_name FROM teachers ORDER BY last_name, first_name').all(),
    months: MONTHS,
    days: DAYS
  });
});

router.put('/settings/password', (req, res) => {
  const { current, next } = req.body;
  if (!current || !next) return res.status(400).json({ message: 'كلمة المرور الحالية والجديدة مطلوبة.' });
  if (String(next).length < 6) return res.status(400).json({ message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(current, user.password_hash)) return res.status(401).json({ message: 'كلمة المرور الحالية غير صحيحة.' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(next, 10), req.user.id);
  res.json({ message: 'تم تغيير كلمة المرور بنجاح.' });
});

module.exports = router;