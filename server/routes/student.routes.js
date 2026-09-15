const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('ROLE_STUDENT'));

// ============ الإعلانات النشطة للتلميذ ============
router.get('/announcements', async (req, res) => {
  const rows = (await db.prepare(`
    SELECT id, message, images, status, created_at, updated_at
    FROM announcements
    WHERE status = 1
    ORDER BY created_at DESC, id DESC
    LIMIT 5
  `).all()).map(a => ({ ...a, images: JSON.parse(a.images || '[]') }));
  res.json({ announcements: rows });
});

// ============ بيانات التلميذ الحالي ============
router.get('/me', async (req, res) => {
  const student = await db.prepare(`
    SELECT s.id, s.first_name, s.last_name, s.reg_number, s.phone, s.status,
           l.id AS level_id, l.name AS level_name,
           c.id AS class_id, c.name AS class_name,
           ay.name AS academic_year_name
    FROM students s
    JOIN levels l ON l.id = s.level_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN academic_years ay ON ay.id = s.academic_year_id
    WHERE s.id = ? AND s.status = 1
  `).get(req.user.studentId);

  if (!student) {
    return res.status(403).json({ message: 'حسابك غير مفعل، يرجى التواصل مع الإدارة.' });
  }

  const selections = await db.prepare(`
    SELECT sg.id, g.name AS group_name, g.day, g.start_time, g.end_time, g.capacity,
           g.id AS group_id, sg.status,
           t.id AS teacher_id, t.first_name AS tfirst, t.last_name AS tlast,
           sub.name AS subject_name
    FROM student_group_selections sg
    JOIN groups g ON g.id = sg.group_id
    JOIN teachers t ON t.id = g.teacher_id
    JOIN subjects sub ON sub.id = g.subject_id
    WHERE sg.student_id = ?
    ORDER BY t.last_name, t.first_name
  `).all(req.user.studentId);

  const payments = await db.prepare(`
    SELECT month_index, payment_date, is_paid FROM payments WHERE student_id = ?
  `).all(req.user.studentId);

  res.json({ student, selections, payments });
});

// ============ قائمة الأساتذة حسب مستوى وشعبة التلميذ ============
router.get('/teachers', async (req, res) => {
  const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.studentId);
  if (!student || student.status !== 1) return res.status(403).json({ message: 'حسابك غير مفعل.' });

  const classJoin = student.class_id
    ? 'JOIN teacher_classes tc ON tc.teacher_id = t.id AND tc.class_id = ?'
    : '';
  const params = student.class_id
    ? [req.user.studentId, student.level_id, student.class_id]
    : [req.user.studentId, student.level_id];

  const rows = await db.prepare(`
    SELECT DISTINCT t.id, t.first_name, t.last_name, t.photo, t.subject_id,
           sub.name AS subject_name,
           (SELECT COUNT(*) FROM student_group_selections sg WHERE sg.student_id = ? AND sg.teacher_id = t.id) AS already_selected,
           (SELECT COUNT(*) FROM groups g WHERE g.teacher_id = t.id AND g.status = 1) AS has_groups
    FROM teachers t
    JOIN subjects sub ON sub.id = t.subject_id
    JOIN teacher_levels tl ON tl.teacher_id = t.id AND tl.level_id = ?
    ${classJoin}
    WHERE t.status = 1
    ORDER BY has_groups DESC, t.last_name, t.first_name
  `).all(...params);

  res.json({ teachers: rows });
});

// ============ تفاصيل الأستاذ + الأفواج المتاحة للتلميذ ============
router.get('/teachers/:id', async (req, res) => {
  const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.studentId);
  if (!student || student.status !== 1) return res.status(403).json({ message: 'حسابك غير مفعل.' });

  const teacherId = Number(req.params.id);
  const teacher = await db.prepare(`
    SELECT t.*, sub.name AS subject_name
    FROM teachers t JOIN subjects sub ON sub.id = t.subject_id
    WHERE t.id = ?
  `).get(teacherId);

  if (!teacher) return res.status(404).json({ message: 'الأستاذ غير موجود.' });

  const teachesLevel = await db.prepare('SELECT 1 FROM teacher_levels WHERE teacher_id = ? AND level_id = ?').get(teacherId, student.level_id);
  if (!teachesLevel) {
    return res.status(403).json({ message: 'هذا الأستاذ لا يدرّس مستواك.' });
  }
  if (student.class_id) {
    const teachesClass = await db.prepare('SELECT 1 FROM teacher_classes WHERE teacher_id = ? AND class_id = ?').get(teacherId, student.class_id);
    if (!teachesClass) {
      return res.status(403).json({ message: 'هذا الأستاذ لا يدرّس شعبتك.' });
    }
  }

  const mySelection = await db.prepare(`
    SELECT sg.id, sg.group_id, g.name AS group_name, g.day, g.start_time, g.end_time, sg.status
    FROM student_group_selections sg
    JOIN groups g ON g.id = sg.group_id
    WHERE sg.student_id = ? AND sg.teacher_id = ?
  `).get(req.user.studentId, teacherId);

  const groups = await db.prepare(`
    SELECT g.id, g.name, g.day, g.start_time, g.end_time, g.capacity, g.status,
           (SELECT COUNT(*) FROM student_group_selections sg WHERE sg.group_id = g.id) AS occupied,
           sub.name AS subject_name
    FROM groups g
    JOIN subjects sub ON sub.id = g.subject_id
    WHERE g.teacher_id = ? AND g.status = 1 AND g.level_id = ? AND (g.class_id = ? OR g.class_id IS NULL)
    ORDER BY g.day, g.start_time, g.name
  `).all(teacherId, student.level_id, student.class_id);

  const teachersCount = await db.prepare(`
    SELECT COUNT(*) AS c FROM student_group_selections
    WHERE student_id = ? AND group_id IN (SELECT id FROM groups WHERE teacher_id = ?)
  `).get(req.user.studentId, teacherId);

  res.json({
    teacher,
    groups: groups.map(g => ({
      ...g,
      full: g.occupied >= g.capacity,
      is_mine: mySelection && mySelection.group_id === g.id
    })),
    my_selection: mySelection || null,
    total_selections_for_teacher: teachersCount.c
  });
});

// ============ اختيار فوج (مع جميع القيود داخل معاملة) ============
const MONTHS = ['سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر', 'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي'];

router.post('/groups/:id/select', async (req, res) => {
  const studentId = req.user.studentId;
  const groupId = Number(req.params.id);

  const selectGroup = db.transaction(async () => {
    const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    if (!student) throw { status: 404, message: 'التلميذ غير موجود.' };
    if (student.status !== 1) throw { status: 403, message: 'حسابك غير مفعل، يرجى التواصل مع الإدارة.' };

    const group = await db.prepare(`
      SELECT g.*, t.first_name AS tfirst, t.last_name AS tlast
      FROM groups g JOIN teachers t ON t.id = g.teacher_id
      WHERE g.id = ?
    `).get(groupId);
    if (!group) throw { status: 404, message: 'الفوج غير موجود.' };
    if (group.status !== 1) throw { status: 400, message: 'هذا الفوج مغلق حالياً.' };

    if (group.level_id !== student.level_id || (group.class_id && group.class_id !== student.class_id)) {
      throw { status: 403, message: 'هذا الفوج غير متاح لمستواك أو شعبتك.' };
    }

    const lvl = await db.prepare('SELECT 1 FROM teacher_levels WHERE teacher_id = ? AND level_id = ?').get(group.teacher_id, student.level_id);
    if (!lvl) throw { status: 403, message: 'هذا الأستاذ لا يدرّس مستواك.' };
    if (student.class_id) {
      const cls = await db.prepare('SELECT 1 FROM teacher_classes WHERE teacher_id = ? AND class_id = ?').get(group.teacher_id, student.class_id);
      if (!cls) throw { status: 403, message: 'هذا الأستاذ لا يدرّس شعبتك.' };
    }

    const existing = await db.prepare('SELECT id FROM student_group_selections WHERE student_id = ? AND teacher_id = ?').get(studentId, group.teacher_id);
    if (existing) throw { status: 400, message: 'لقد قمت باختيار فوج لهذا الأستاذ مسبقاً.' };

    const occ = await db.prepare('SELECT COUNT(*) AS c FROM student_group_selections WHERE group_id = ?').get(groupId);
    if (occ.c >= group.capacity) throw { status: 409, message: 'هذا الفوج مكتمل.' };

    const insPay = db.prepare('INSERT OR IGNORE INTO payments (student_id, month_index, is_paid) VALUES (?, ?, 0)');
    for (let i = 0; i < MONTHS.length; i++) await insPay.run(studentId, i);

    const result = await db.prepare(`
      INSERT INTO student_group_selections (student_id, group_id, teacher_id, status)
      VALUES (?, ?, ?, 'confirmed')
    `).run(studentId, groupId, group.teacher_id);

    return { id: result.lastInsertRowid, group };
  });

  try {
    const { id, group } = await selectGroup();
    await db.prepare(`
      INSERT INTO schedules (group_id, day, start_time, end_time)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(group_id) DO UPDATE SET day=excluded.day, start_time=excluded.start_time, end_time=excluded.end_time
    `).run(groupId, group.day, group.start_time, group.end_time);

    res.status(201).json({
      message: 'تم تأكيد اختيارك بنجاح.',
      selection_id: id
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'حدث خطأ غير متوقع.' });
  }
});

// ============ حسابي ============
router.get('/account', async (req, res) => {
  const student = await db.prepare(`
    SELECT s.id, s.first_name, s.last_name, s.reg_number, s.phone,
           l.name AS level_name, c.name AS class_name, ay.name AS academic_year_name
    FROM students s
    JOIN levels l ON l.id = s.level_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN academic_years ay ON ay.id = s.academic_year_id
    WHERE s.id = ?
  `).get(req.user.studentId);

  const selections = await db.prepare(`
    SELECT t.first_name AS tfirst, t.last_name AS tlast, sub.name AS subject_name,
           g.name AS group_name, g.day, g.start_time, g.end_time, sg.status
    FROM student_group_selections sg
    JOIN groups g ON g.id = sg.group_id
    JOIN teachers t ON t.id = g.teacher_id
    JOIN subjects sub ON sub.id = g.subject_id
    WHERE sg.student_id = ?
    ORDER BY t.last_name, t.first_name
  `).all(req.user.studentId);

  const payments = await db.prepare(`
    SELECT month_index, payment_date, is_paid FROM payments WHERE student_id = ? ORDER BY month_index
  `).all(req.user.studentId);

  res.json({ student, selections, payments });
});

// ============ الجدول الدراسي للتلميذ (الأفواج المختارة فقط) ============
router.get('/schedule', async (req, res) => {
  const schedule = await db.prepare(`
    SELECT t.first_name AS tfirst, t.last_name AS tlast, sub.name AS subject_name,
           g.name AS group_name, g.day, g.start_time, g.end_time
    FROM student_group_selections sg
    JOIN groups g ON g.id = sg.group_id
    JOIN teachers t ON t.id = g.teacher_id
    JOIN subjects sub ON sub.id = g.subject_id
    WHERE sg.student_id = ?
    ORDER BY CASE g.day WHEN 'السبت' THEN 1 WHEN 'الأحد' THEN 2 WHEN 'الاثنين' THEN 3
             WHEN 'الثلاثاء' THEN 4 WHEN 'الأربعاء' THEN 5 WHEN 'الخميس' THEN 6 WHEN 'الجمعة' THEN 7 END,
             g.start_time
  `).all(req.user.studentId);

  res.json({ schedule });
});

// ============ تلاميذ فوج معين (عرض فقط للتلميذ المسجل) ============
router.get('/groups/:id/members', async (req, res) => {
  const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.studentId);
  if (!student || student.status !== 1) return res.status(403).json({ message: 'حسابك غير مفعل.' });

  const gid = Number(req.params.id);
  const group = await db.prepare(`
    SELECT g.*, t.first_name AS tfirst, t.last_name AS tlast, sub.name AS subject_name
    FROM groups g
    JOIN teachers t ON t.id = g.teacher_id
    JOIN subjects sub ON sub.id = g.subject_id
    WHERE g.id = ? AND g.level_id = ? AND (g.class_id = ? OR g.class_id IS NULL)
  `).get(gid, student.level_id, student.class_id);
  if (!group) return res.status(404).json({ message: 'الفوج غير موجود.' });

  const students = await db.prepare(`
    SELECT s.first_name, s.last_name, s.reg_number
    FROM student_group_selections sg
    JOIN students s ON s.id = sg.student_id
    WHERE sg.group_id = ?
    ORDER BY s.last_name, s.first_name
  `).all(gid);

  res.json({ group, students });
});

module.exports = router;