"use strict";
// ==================== خدمة دورات الدفع (Payment Cycles) ====================
// القاعدة: كل دورة شهرية من اليوم 12 إلى اليوم 11 من الشهر التالي.
// - لا يوجد تاريخ ارت��از مثبّت: النطاق يُشتق من أي تاريخ (مثال: 2026-09-12 ← 2026-10-11 مجرّد مثال)
// - cycles محسوبة على الخادم بتوقيت الجزائر (لا cron، لا اعتماد على الواجهة)
// - كل دورة صف مستقل في payment_cycles (start/end + label + cycle_index مطلق)
// - سجل الدفع مربوط بـ cycle_id وليس برقم شهر ثابت
// - UNIQUE(student_id, cycle_id) يمنع الدفع المكرر
// - عند إنشاء الدورة يُدرج سجل UNPAID لكل تلميذ نشط
// - كل تعديل يُسجَّل في payment_audit حتى لا يضيع التاريخ

const db = require('../db/database');
const {
  parseIsoDate, toIsoDate, daysInMonth, todayAlgiers
} = require('./payment.service');

// قاعدة الدورة: من اليوم 12 إلى اليوم 11
const CYCLE_START_DAY = 12;
const CYCLE_END_DAY = 11;
// أسماء الأشهر بالتقويم الميلادي (0 = جانفي)
const AR_MONTHS = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
// السنة الدراسية: من سبتمبر إلى ماي فقط (جوان/جويلية/أوت عطلة — لا دورات)
const SCHOOL_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5];
const isSchoolMonth = mo => SCHOOL_MONTHS.includes(Number(mo));
// الأفق: لا تُنشأ دورات أبعد من N شهراً من اليوم (افتراضياً سنة واحدة — الجاهزية للسنة التالية)
const CYCLE_HORIZON_MONTHS = Number(process.env.CYCLE_HORIZON_MONTHS || 12);
const monthDiff = (aIso, bIso) => {
  const a = parseIsoDate(aIso), b = parseIsoDate(bIso);
  if (!a || !b) return 0;
  return (b.y - a.y) * 12 + (b.mo - a.mo);
};
const TZ = 'Africa/Algiers';
const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 200;

// ==================== حساب التواريخ (دوال نقية) ====================

// اليوم بالأوقيت الجزائري بصيغة YYYY-MM-DD
function today(now) {
  return todayAlgiers(now);
}

// ختم زمني محمول بين PostgreSQL و SQLite
function nowStamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// تاريخ ISO مكوّن من أجزاء
function ymd(y, mo, d) {
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// اليوم السابق لتاريخ ISO (يتعامل مع نهاية الشهر/السنة بشكل صحيح)
function dayBefore(iso) {
  const p = parseIsoDate(iso);
  if (!p) throw new Error('تاريخ غير صالح.');
  if (p.d > 1) return toIsoDate({ y: p.y, mo: p.mo, d: p.d - 1 });
  const mo = p.mo === 1 ? 12 : p.mo - 1;
  const y = p.mo === 1 ? p.y - 1 : p.y;
  return toIsoDate({ y, mo, d: daysInMonth(y, mo) });
}

// رقم الشهر المطلق (مستقل عن أي تاريخ ارت��از): 2026-09 => 2026*12 + 8
function monthOrdinal(iso) {
  const p = parseIsoDate(iso);
  if (!p) throw new Error('تاريخ غير صالح.');
  return p.y * 12 + (p.mo - 1);
}

// العكس: من رقم الشهر المطلق إلى { y, mo }
function ordinalMonth(k) {
  const n = Number(k);
  if (!Number.isInteger(n)) throw new Error('رقم دورة غير صالح.');
  return { y: Math.floor(n / 12), mo: (n % 12) + 1 };
}

// نطاق الدورة رقم k: [بداية الشهر k يوم 12، نهاية الشهر k+1 يوم 11]
// k = رقم الشهر المطلق، فلا حد لعدد الدورات ولا تاريخ بداية مثبّت
function cycleRangeByIndex(k) {
  const { y, mo } = ordinalMonth(k);
  const next = ordinalMonth(Number(k) + 1);
  const start = `${ymd(y, mo, CYCLE_START_DAY)}`;
  const end = dayBefore(ymd(next.y, next.mo, CYCLE_START_DAY));
  return { cycle_index: Number(k), start, end, label: `${AR_MONTHS[mo - 1]} ${y}`, year: y, month: mo };
}

// الدورة التي يقع فيها التاريخ المعطى (12..آخر الشهر ← نفس الشهر، 1..11 ← الشهر السابق)
function cycleRangeFor(iso) {
  const day = String(iso || today());
  const p = parseIsoDate(day);
  if (!p) throw new Error('تاريخ غير صالح.');
  const k = p.d >= CYCLE_START_DAY ? monthOrdinal(day) : monthOrdinal(day) - 1;
  return cycleRangeByIndex(k);
}

// يحدد دورة اليوم دون أي كتابة في قاعدة البيانات (دائماً غير null)
function resolveCycle(todayIso) {
  const day = String(todayIso || today());
  const r = cycleRangeFor(day);
  return { ...r, today: day, anchor_date: r.start };
}

// ==================== إدارة الدورات في قاعدة البيانات ====================

// إدراج دورة (idempotent عبر UNIQUE(start_date))
async function insertCycle(range) {
  // السنة الدراسية: سبتمبر ← ماي فقط
  const rm = cycleRangeFor(range.start);
  if (!isSchoolMonth(rm.month)) return null;
  // أفق معقول: لا دورات أبعد من CYCLE_HORIZON_MONTHS شهراً من اليوم
  if (monthDiff(today(), range.start) > CYCLE_HORIZON_MONTHS) return null;
  // حد أدنى للسجل: لا تُنشأ دورة أقدم من أقدم دورة موجودة (بداية السنة الدراسية ثابتة)
  const first = await db.prepare('SELECT MIN(start_date) AS s FROM payment_cycles').get();
  if (first && first.s && range.start < first.s) return null;
  await db.prepare(
    `INSERT INTO payment_cycles (anchor_date, start_date, end_date, label, cycle_index)
     VALUES (?, ?, ?, ?, ?) ON CONFLICT (start_date) DO NOTHING`
  ).run(range.start, range.start, range.end, range.label, Number(range.cycle_index));
  return db.prepare('SELECT * FROM payment_cycles WHERE start_date = ?').get(range.start);
}

// سبب رفض تاريخ (يوضّح للمدير为何 لا توجد دورة لهذا التاريخ)
function describeBlockedCycle(iso) {
  const r = cycleRangeFor(iso);
  if (!isSchoolMonth(r.month)) {
    return {
      range: r,
      reason: `السنة الدراسية من سبتمبر إلى ماي — التاريخ ${iso} يقع في دورة «${r.label}» وهي خارج السنة الدراسية.`
    };
  }
  const far = monthDiff(today(), r.start);
  if (far > CYCLE_HORIZON_MONTHS) {
    return {
      range: r,
      reason: `الدورات جاهزة حتى ${CYCLE_HORIZON_MONTHS} شهراً قادمة من اليوم (${today()}) — التاريخ ${iso} يقع في دورة «${r.label}» وهي خارج المدى.`
    };
  }
  return { range: r, reason: null };
}

// يضمن وجود الدورة التي يقع فيها هذا التاريخ
async function ensureCycleRow(iso) {
  return insertCycle(cycleRangeFor(iso));
}

// يضمن وجود الدورة رقم k
async function ensureCycleAtIndex(k) {
  return insertCycle(cycleRangeByIndex(k));
}

// إدراج سجل UNPAID لكل تلميذ نشط لا يملك سجلاً في هذه الدورة
async function ensureRoster(cycleId) {
  const res = await db.prepare(
    `INSERT INTO cycle_payments (student_id, cycle_id, status)
     SELECT s.id, ?, 'UNPAID' FROM students s
     WHERE s.status = 1
       AND NOT EXISTS (SELECT 1 FROM cycle_payments cp WHERE cp.student_id = s.id AND cp.cycle_id = ?)
     ON CONFLICT (student_id, cycle_id) DO NOTHING`
  ).run(cycleId, cycleId);
  return res.changes || 0;
}

// الدورة الحالية: تُنشأ وتُرمَّن عند الحاجة (لا اعتماد على cron)
async function getOrCreateCurrentCycle(todayIso) {
  const r = resolveCycle(todayIso);
  // ملء أي فجوة بين أقدم دورة مسجّلة والدورة الحالية (استمرارية التاريخ)
  // نقرأ أقدم start_date (تاريخ ISO صالح دائماً) لا cycle_index (قد تكون قديمة بصيغة أخرى)
  const first = await db.prepare('SELECT MIN(start_date) AS s FROM payment_cycles').get();
  const from = first && first.s ? cycleRangeFor(first.s).cycle_index : r.cycle_index;
  for (let k = from; k <= r.cycle_index; k++) await insertCycle(cycleRangeByIndex(k));
  const cycle = await db.prepare('SELECT * FROM payment_cycles WHERE start_date = ?').get(r.start);
  if (!cycle) return null;
  await ensureRoster(cycle.id);
  return cycle;
}

async function getCycleById(id) {
  return db.prepare('SELECT * FROM payment_cycles WHERE id = ?').get(Number(id));
}

// كل الدورات مع إحصاءاتها
async function listCycles() {
  const rows = await db.prepare(
    `SELECT c.*,
            COUNT(cp.id) AS total,
            COALESCE(SUM(CASE WHEN cp.status = 'PAID' THEN 1 ELSE 0 END), 0) AS paid,
            COALESCE(SUM(CASE WHEN cp.status = 'UNPAID' THEN 1 ELSE 0 END), 0) AS unpaid,
            COALESCE(SUM(CASE WHEN cp.status = 'PAID' THEN cp.amount ELSE 0 END), 0) AS collected
     FROM payment_cycles c
     LEFT JOIN cycle_payments cp ON cp.cycle_id = c.id
     GROUP BY c.id
     ORDER BY c.start_date DESC`
  ).all();
  const nowIso = today();
  return rows.map(r => decorateCycle(r, nowIso));
}

function decorateCycle(c, nowIso) {
  if (!c) return null;
  const is_current = !!nowIso && c.start_date <= nowIso && c.end_date >= nowIso;
  const is_future = !!nowIso && c.start_date > nowIso;
  return {
    id: c.id,
    label: c.label,
    start_date: c.start_date,
    end_date: c.end_date,
    cycle_index: c.cycle_index,
    anchor_date: c.anchor_date,
    total: Number(c.total || 0),
    paid: Number(c.paid || 0),
    unpaid: Number(c.unpaid || 0),
    collected: Number(c.collected || 0),
    is_current: is_current,
    is_future: is_future
  };
}

async function getCycleStats(cycleId) {
  const c = await getCycleById(cycleId);
  if (!c) return null;
  const row = await db.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END), 0) AS paid,
            COALESCE(SUM(CASE WHEN status = 'UNPAID' THEN 1 ELSE 0 END), 0) AS unpaid,
            COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END), 0) AS collected
     FROM cycle_payments WHERE cycle_id = ?`
  ).get(Number(cycleId));
  const nowIso = today();
  const days_left = Math.max(0, Math.round((new Date(c.end_date) - new Date(nowIso)) / 86400000));
  return { ...decorateCycle({ ...c, ...row }, nowIso), days_left: c.end_date < nowIso ? 0 : days_left };
}

// ==================== الاستعلامات ====================

function paginate(page, perPage) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(MAX_PER_PAGE, Math.max(1, Number(perPage) || DEFAULT_PER_PAGE));
  return { p, size, offset: (p - 1) * size };
}

// فلاتر مشتركة (بحث/مستوى/شعبة) تعمل على PostgreSQL و SQLite معاً
function studentFilter(f) {
  const where = [];
  const params = [];
  const q = String((f && f.q) || '').trim().toLowerCase();
  if (q) {
    where.push(`(LOWER(s.first_name) LIKE ? OR LOWER(s.last_name) LIKE ? OR LOWER(s.reg_number) LIKE ?)`);
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (f && f.level_id) { where.push('s.level_id = ?'); params.push(Number(f.level_id)); }
  if (f && f.class_id) { where.push('s.class_id = ?'); params.push(Number(f.class_id)); }
  return { where, params };
}

const SELECT_STUDENT = `
  SELECT s.id AS student_id, s.first_name, s.last_name, s.reg_number, s.status,
         l.name AS level_name, c.name AS class_name`;

// ترتيب رقمي صحيح لرقم التسجيل: 001, 002, 003, 010, 011, 020 (وليس أبجدياً)
const REG_SORT_TIE = db.dialect === 'postgres'
  ? `NULLIF(regexp_replace(s.reg_number, '\\D', '', 'g'), '')::numeric NULLS LAST, s.reg_number, s.id`
  : `CAST(REPLACE(REPLACE(IFNULL(s.reg_number, ''), ' ', ''), '-', '') AS INTEGER), s.reg_number, s.id`;

// تلاميذ دورة مع حالتهم في تلك الدورة + pagination
// الترتيب دائماً حسب رقم تسجيل تصاعدياً (Server-side) — لا حسب الاسم ولا حالة الدفع
async function getUnpaidStudents(cycleId, filters) {
  const { p, size, offset } = paginate(filters && filters.page, filters && filters.per_page);
  const f = studentFilter(filters);
  const params = [Number(cycleId)];
  const from = `
    FROM cycle_payments cp
    JOIN students s ON s.id = cp.student_id
    LEFT JOIN levels l ON l.id = s.level_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE cp.cycle_id = ?`;
  let sql = `${SELECT_STUDENT}, cp.id AS payment_id, cp.status AS payment_status, cp.amount, cp.paid_at, cp.note
    ${from}`;
  if (f.where.length) { sql += ` AND ${f.where.join(' AND ')}`; params.push(...f.params); }

  const rows = await db.prepare(`${sql} ORDER BY ${REG_SORT_TIE} LIMIT ? OFFSET ?`).all(...params, size, offset);
  const win = windowRange(filters);
  const withMonths = await attachUnpaidMonths(rows, null, win.from, win.to);
  const counts = await db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN cp.status = 'PAID' THEN 1 ELSE 0 END) AS paid
     FROM cycle_payments cp JOIN students s ON s.id = cp.student_id
     WHERE cp.cycle_id = ?${f.where.length ? ` AND ${f.where.join(' AND ')}` : ''}`
  ).get(Number(cycleId), ...f.params);
  const paidTotal = Number(counts.paid || 0);
  const grandTotal = Number(counts.total || 0);
  return {
    rows: withMonths,
    total: grandTotal,
    paid_total: paidTotal,
    unpaid_total: grandTotal - paidTotal,
    page: p,
    per_page: size,
    pages: Math.max(1, Math.ceil(grandTotal / size))
  };
}

// نافذة زمنية يحددها المدير (من / إلى) — افتراضياً: كل الدورات التي بدأت حتى اليوم
function windowRange(f) {
  const isD = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(new Date(v).getTime());
  const from = isD(f && f.from) ? String(f.from).slice(0, 10) : '0000-01-01';
  const to = isD(f && f.to) ? String(f.to).slice(0, 10) : today();
  return { from, to };
}

// كل الدورات غير المدفوعة داخل نافذة من/إلى (الأقدم ← الأحدث)
// تُحسب من cycle_payments + payment_cycles، وتتحرك تلقائياً عند أي تسجيل دفع
async function attachUnpaidMonths(rows, asOf, fromDate, toDate) {
  const ids = [...new Set(rows.map(r => Number(r.student_id)).filter(Boolean))];
  const byStudent = new Map();
  if (ids.length) {
    const nowIso = asOf || today();
    const winFrom = fromDate || '0000-01-01';
    const winTo = toDate || nowIso;
    const list = await db.prepare(
      `SELECT cp.student_id, c.id AS cycle_id, c.label, c.start_date, c.end_date
       FROM cycle_payments cp
       JOIN payment_cycles c ON c.id = cp.cycle_id
       WHERE cp.student_id IN (${ids.map(() => '?').join(',')})
         AND cp.status = 'UNPAID'
         AND c.end_date >= ? AND c.start_date <= ?
       ORDER BY c.start_date`
    ).all(...ids, winFrom, winTo);
    for (const row of list) {
      const sid = Number(row.student_id);
      if (!byStudent.has(sid)) byStudent.set(sid, []);
      byStudent.get(sid).push({
        cycle_id: Number(row.cycle_id), label: row.label, start_date: row.start_date, end_date: row.end_date
      });
    }
  }
  return rows.map(r => {
    const unpaid_months = byStudent.get(Number(r.student_id)) || [];
    return { ...r, unpaid_months, unpaid_months_count: unpaid_months.length };
  });
}

// سجلات دورة مع فلترة الحالة + pagination
async function getCyclePayments(cycleId, filters) {
  const { p, size, offset } = paginate(filters && filters.page, filters && filters.per_page);
  const f = studentFilter(filters);
  const status = String((filters && filters.status) || '').toUpperCase();
  const where = ['cp.cycle_id = ?'];
  const params = [Number(cycleId)];
  if (status === 'PAID' || status === 'UNPAID') { where.push('cp.status = ?'); params.push(status); }
  if (f.where.length) { where.push(...f.where); params.push(...f.params); }
  const w = where.join(' AND ');

  const totalRow = await db.prepare(
    `SELECT COUNT(*) AS c FROM cycle_payments cp JOIN students s ON s.id = cp.student_id WHERE ${w}`
  ).get(...params);
  const rows = await db.prepare(
    `${SELECT_STUDENT}, cp.id AS payment_id, cp.status, cp.amount, cp.paid_at, cp.note, cp.updated_at
     FROM cycle_payments cp
     JOIN students s ON s.id = cp.student_id
     LEFT JOIN levels l ON l.id = s.level_id
     LEFT JOIN classes c ON c.id = s.class_id
     WHERE ${w} ORDER BY ${REG_SORT_TIE} LIMIT ? OFFSET ?`
  ).all(...params, size, offset);
  return { rows, total: Number(totalRow.c || 0), page: p, per_page: size, pages: Math.max(1, Math.ceil(Number(totalRow.c || 0) / size)) };
}

// سجل تلميذ عبر كل الدورات (يتضمن الدورات التي لم يدفع فيها)
async function getStudentPaymentHistory(studentId) {
  const student = await db.prepare(
    `${SELECT_STUDENT} FROM students s LEFT JOIN levels l ON l.id = s.level_id LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`
  ).get(Number(studentId));
  if (!student) return null;
  const rows = await db.prepare(
    `SELECT c.id AS cycle_id, c.label, c.start_date, c.end_date, c.cycle_index,
            cp.id AS payment_id, cp.status, cp.amount, cp.paid_at, cp.note
     FROM payment_cycles c
     LEFT JOIN cycle_payments cp ON cp.cycle_id = c.id AND cp.student_id = ?
     ORDER BY c.start_date DESC`
  ).all(Number(studentId));
  const nowIso = today();
  return {
    student,
    cycles: rows.map(r => ({
      cycle_id: r.cycle_id,
      label: r.label,
      start_date: r.start_date,
      end_date: r.end_date,
      payment_id: r.payment_id,
      status: r.payment_id ? r.status : 'UNPAID',
      amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
      paid_at: r.paid_at,
      note: r.note,
      is_current: r.start_date <= nowIso && r.end_date >= nowIso,
      is_future: r.start_date > nowIso
    })),
    audit: await db.prepare(
      'SELECT * FROM payment_audit WHERE student_id = ? ORDER BY id DESC LIMIT 100'
    ).all(Number(studentId))
  };
}

async function getAuditTrail(cycleId) {
  return db.prepare(
    `SELECT a.*, u.username FROM payment_audit a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.cycle_id = ? ORDER BY a.id DESC LIMIT 200`
  ).all(Number(cycleId));
}

// ==================== التعديلات ====================

async function logAudit(entry) {
  await db.prepare(
    `INSERT INTO payment_audit (cycle_payments_id, cycle_id, student_id, action, from_status, to_status, amount, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.payment_id || null, entry.cycle_id || null, Number(entry.student_id), entry.action,
    entry.from_status || null, entry.to_status || null,
    entry.amount === undefined || entry.amount === null ? null : Number(entry.amount),
    entry.user_id ? Number(entry.user_id) : null, nowStamp()
  );
}

// تسجيل / تحديث دفعة على دورة محددة (حتى دورة سابقة = دفع متأخر).
// لا ينشئ صفاً ثانياً لنفس التلميذ في نفس الدورة (ON CONFLICT DO UPDATE).
async function recordPayment({ studentId, cycleId, amount, status, note, userId, paidAt }) {
  const sid = Number(studentId);
  const cid = Number(cycleId);
  if (!sid || !cid) throw new Error('بيانات تسجيل الدفع ناقصة.');
  const st = String(status || 'PAID').toUpperCase() === 'PAID' ? 'PAID' : 'UNPAID';
  const cycle = await getCycleById(cid);
  if (!cycle) throw new Error('الدورة غير موجودة.');
  const student = await db.prepare('SELECT id, first_name, last_name, status FROM students WHERE id = ?').get(sid);
  if (!student) throw new Error('التلميذ غير موجود.');
  const amt = (amount === undefined || amount === null || amount === '') ? null : Number(amount);
  if (amt !== null && (!Number.isFinite(amt) || amt < 0)) throw new Error('المبلغ غير صالح.');
  let paid = null;
  if (st === 'PAID') {
    paid = today();
    if (paidAt !== undefined && paidAt !== null && String(paidAt).trim() !== '') {
      const raw = String(paidAt).trim();
      const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) throw new Error('تاريخ الدفع غير صالح (الصيغة المطلوبة: YYYY-MM-DD).');
      const iso = `${m[1]}-${m[2]}-${m[3]}`;
      const d = parseIsoDate(iso);
      if (!d || d.mo < 1 || d.mo > 12 || d.d < 1 || d.d > daysInMonth(d.y, d.mo)) {
        throw new Error('تاريخ الدفع غير صالح.');
      }
      if (iso > today()) throw new Error('لا يمكن تسجيل تاريخ دفع في المستقبل.');
      paid = iso;
    }
  }

  const before = await db.prepare('SELECT * FROM cycle_payments WHERE student_id = ? AND cycle_id = ?').get(sid, cid);

  await db.prepare(
    `INSERT INTO cycle_payments (student_id, cycle_id, status, amount, paid_at, created_by, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (student_id, cycle_id) DO UPDATE SET
       status = EXCLUDED.status,
       amount = EXCLUDED.amount,
       paid_at = EXCLUDED.paid_at,
       created_by = EXCLUDED.created_by,
       note = COALESCE(EXCLUDED.note, cycle_payments.note),
       updated_at = EXCLUDED.updated_at`
  ).run(sid, cid, st, amt, paid, userId ? Number(userId) : null, note ? String(note).trim() : null, nowStamp(), nowStamp());

  const row = await db.prepare('SELECT * FROM cycle_payments WHERE student_id = ? AND cycle_id = ?').get(sid, cid);
  await logAudit({
    payment_id: row.id, cycle_id: cid, student_id: sid,
    action: before ? 'UPDATE' : 'RECORD',
    from_status: before ? before.status : null,
    to_status: st, amount: amt, user_id: userId
  });
  return row;
}

// إلغاء دفعة: يغيّر الحالة فقط (لا حذف) مع حفظ الأثر في payment_audit
async function cancelPayment({ studentId, cycleId, userId, reason }) {
  const sid = Number(studentId);
  const cid = Number(cycleId);
  const before = await db.prepare('SELECT * FROM cycle_payments WHERE student_id = ? AND cycle_id = ?').get(sid, cid);
  if (!before) throw new Error('لا يوجد سجل دفع لهذه الدورة.');
  await db.prepare(
    `UPDATE cycle_payments SET status = 'UNPAID', paid_at = NULL, note = ?, updated_at = ? WHERE id = ?`
  ).run(reason ? String(reason).trim() : before.note, nowStamp(), before.id);
  await logAudit({
    payment_id: before.id, cycle_id: cid, student_id: sid, action: 'CANCEL',
    from_status: before.status, to_status: 'UNPAID', amount: before.amount, user_id: userId
  });
  return db.prepare('SELECT * FROM cycle_payments WHERE id = ?').get(before.id);
}

// الدورات غير المدفوعة لطالب واحد (الأقدم ← الأحدث) + الدورة الجارية
// تُستخدم في نافذة الدفع لتسديد عدة أشهر متأخرة دفعة واحدة
async function getStudentDueCycles(studentId) {
  const sid = Number(studentId);
  const student = await db.prepare('SELECT id, reg_number, first_name, last_name, status FROM students WHERE id = ?').get(sid);
  if (!student) return null;
  const current = await getOrCreateCurrentCycle();
  const curK = Number(current.cycle_index);
  const nowIso = today();
  const rows = await db.prepare(
    `SELECT c.*, cp.id AS payment_id, cp.status, cp.amount, cp.paid_at
       FROM cycle_payments cp
       JOIN payment_cycles c ON c.id = cp.cycle_id
      WHERE cp.student_id = ? AND cp.status = 'UNPAID' AND c.cycle_index <= ?
      ORDER BY c.cycle_index ASC`
  ).all(sid, curK);
  const all = await db.prepare(
    `SELECT c.*, cp.id AS payment_id, cp.status, cp.amount, cp.paid_at
       FROM cycle_payments cp
       JOIN payment_cycles c ON c.id = cp.cycle_id
      WHERE cp.student_id = ?
      ORDER BY c.cycle_index ASC`
  ).all(sid);
  const mapRow = r => ({
    ...decorateCycle(r, nowIso),
    payment_id: r.payment_id,
    status: r.status,
    amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
    paid_at: r.paid_at
  });
  return {
    student,
    today: nowIso,
    current_cycle: current,
    due: rows.map(mapRow),
    all: all.map(mapRow)
  };
}

// تسجيل عدة دورات في عملية واحدة (معاملة ذرية: إما الكل أو لا شيء)
async function recordPaymentsBulk({ studentId, items, userId, paidAt }) {
  const sid = Number(studentId);
  if (!sid) throw new Error('التلميذ مطلوب.');
  const list = Array.isArray(items) ? items.filter(it => it && it.cycle_id) : [];
  if (!list.length) throw new Error('اختر شهراً واحداً على الأقل للسداد.');
  if (list.length > 24) throw new Error('عدد الأشهر المسدّدة كبير جداً (الحد 24).');

  const cycleIds = [...new Set(list.map(it => Number(it.cycle_id)))];
  if (cycleIds.length !== list.length) throw new Error('تكرار في الدورات المختارة.');

  return db.transaction(async () => {
    const done = [];
    for (const it of list) {
      const row = await recordPayment({
        studentId: sid,
        cycleId: it.cycle_id,
        amount: it.amount,
        status: 'PAID',
        note: it.note,
        paidAt: paidAt,
        userId
      });
      done.push(row);
    }
    return done;
  })();
}

// إدراج تلميذ جديد في دورة (عند تسجيله بعد بداية الدورة)
async function attachStudentToCycle(studentId, cycleId) {
  await db.prepare(
    `INSERT INTO cycle_payments (student_id, cycle_id, status, created_at) VALUES (?, ?, 'UNPAID', ?)
     ON CONFLICT (student_id, cycle_id) DO NOTHING`
  ).run(Number(studentId), Number(cycleId), nowStamp());
}

module.exports = {
  CYCLE_START_DAY, CYCLE_END_DAY, TZ, DEFAULT_PER_PAGE, SCHOOL_MONTHS, CYCLE_HORIZON_MONTHS, isSchoolMonth, describeBlockedCycle,
  today, nowStamp, dayBefore, monthOrdinal, ordinalMonth, cycleRangeByIndex, cycleRangeFor, resolveCycle,
  ensureCycleRow, ensureCycleAtIndex, ensureRoster, getOrCreateCurrentCycle, getCycleById, listCycles, getCycleStats,
  getUnpaidStudents, getCyclePayments, getStudentPaymentHistory, getAuditTrail, attachUnpaidMonths,
  recordPayment, cancelPayment, attachStudentToCycle, getStudentDueCycles, recordPaymentsBulk
};