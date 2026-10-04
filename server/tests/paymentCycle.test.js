"use strict";
// اختبارات نظام دورات الدفع — node:test

require('dotenv').config();
// الاختبارات لا تلمس قاعدة الإنتاج أبداً: تُجبر الاتصال على SQLite محلي معزول
const TEST_DB = require('node:path').join(__dirname, '..', 'data', 'test-school.db');
process.env.DATABASE_URL = '';
process.env.SQLITE_FILE = TEST_DB;
// الاختبارات تستخدم تاريخاً بعيداً (2030) ⇒ أفق واسع، وتُنظّف أي أثر بعد كل اختبار
process.env.CYCLE_HORIZON_MONTHS = '120';
const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert');
const db = require('../db/database');
const cycles = require('../services/paymentCycle.service');
const svc = cycles;
const { cycleRangeByIndex, cycleRangeFor } = cycles;

before(async () => {
  await db.init();
  // بيانات اختبار داخل SQLite المعزول فقط (لا تمس الإنتاج)
  const active = Number((await db.prepare('SELECT COUNT(*) AS c FROM students WHERE status = 1').get()).c);
  if (active < 5) {
    const level = await db.prepare('SELECT id FROM levels ORDER BY id LIMIT 1').get();
    const cls = await db.prepare('SELECT id FROM classes ORDER BY id LIMIT 1').get();
    const year = await db.prepare('SELECT id FROM academic_years ORDER BY id LIMIT 1').get();
    for (let i = 1; i <= 6; i++) {
      const reg = String(i).padStart(2, '0');
      const exists = await db.prepare('SELECT id FROM students WHERE reg_number = ?').get(reg);
      if (exists) continue;
      const u = await db.prepare(
        "INSERT INTO users (username, password_hash, role, active, created_at) VALUES (?, 'x', 'ROLE_STUDENT', 1, ?) RETURNING id"
      ).get('test-student-' + reg, cycles.nowStamp());
      await db.prepare(
        `INSERT INTO students (user_id, first_name, last_name, reg_number, level_id, class_id, academic_year_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
      ).run(u.id, 'تلميذ', 'اختبار ' + reg, reg, level ? level.id : null, cls ? cls.id : null, year ? year.id : null, cycles.nowStamp());
    }
  }
});

after(async () => {
  if (typeof db.close === 'function') await db.close();
  // نحذف ملف قاعدة الاختبار المعزولة
  for (const suffix of ['', '-wal', '-shm']) {
    try { require('node:fs').unlinkSync(TEST_DB + suffix); } catch { /* غير موجود */ }
  }
});





































































// ==================== 1) القاعدة: كل دورة من اليوم 12 إلى اليوم 11 ====================
// مثال "2026-09-12 ← 2026-10-11" توضيح فقط، وليس تاريخ ارت��از مثبّت

test('اليوم 12 يبدأ دورة جديدة، واليوم 11 ما زال في الدورة السابقة', () => {
  const sep = cycles.cycleRangeFor('2026-09-12');
  assert.strictEqual(sep.start, '2026-09-12');
  assert.strictEqual(sep.end, '2026-10-11');
  assert.strictEqual(cycles.cycleRangeFor('2026-10-11').cycle_index, sep.cycle_index);
  assert.strictEqual(cycles.cycleRangeFor('2026-10-12').cycle_index, sep.cycle_index + 1);
  // 1..11 من كل شهر تنتمي لدورة الشهر السابق
  for (const iso of ['2026-01-01', '2026-01-11', '2026-05-11', '2026-11-11', '2027-01-01']) {
    const r = cycles.cycleRangeFor(iso);
    assert.ok(r.start <= iso && iso <= r.end, iso + ' داخل ' + r.label);
  }
});

test('القاعدة نفسها تُطبَّق على أي شهر وسنة', () => {
  assert.deepStrictEqual(
    [cycles.cycleRangeFor('2026-09-12'), cycles.cycleRangeFor('2026-10-12'), cycles.cycleRangeFor('2026-11-12')],
    [
      { cycle_index: cycles.monthOrdinal('2026-09-12'), start: '2026-09-12', end: '2026-10-11', label: 'سبتمبر 2026', year: 2026, month: 9 },
      { cycle_index: cycles.monthOrdinal('2026-10-12'), start: '2026-10-12', end: '2026-11-11', label: 'أكتوبر 2026', year: 2026, month: 10 },
      { cycle_index: cycles.monthOrdinal('2026-11-12'), start: '2026-11-12', end: '2026-12-11', label: 'نوفمبر 2026', year: 2026, month: 11 }
    ]
  );
  assert.deepStrictEqual(cycles.cycleRangeFor('2026-07-20'), { cycle_index: cycles.monthOrdinal('2026-07-12'), start: '2026-07-12', end: '2026-08-11', label: 'جويلية 2026', year: 2026, month: 7 });
  assert.deepStrictEqual(cycles.cycleRangeFor('2026-03-05'), { cycle_index: cycles.monthOrdinal('2026-02-12'), start: '2026-02-12', end: '2026-03-11', label: 'فيفري 2026', year: 2026, month: 2 });
});

test('الشهور القصيرة: نهاية الدورة 11 من شهر 28/29 يوماً', () => {
  assert.strictEqual(cycles.cycleRangeFor('2027-01-12').end, '2027-02-11');
  assert.deepStrictEqual(cycles.cycleRangeFor('2027-02-12'), { cycle_index: cycles.monthOrdinal('2027-02-12'), start: '2027-02-12', end: '2027-03-11', label: 'فيفري 2027', year: 2027, month: 2 });
  // سنة كبيسة: 29 فيفري 2028 داخل دورة فيفري
  assert.strictEqual(cycles.cycleRangeFor('2028-02-29').end, '2028-03-11');
  assert.strictEqual(cycles.cycleRangeFor('2028-02-29').label, 'فيفري 2028');
});

test('انتقال بين السنوات يحافظ على 12 ← 11', () => {
  assert.deepStrictEqual(cycles.cycleRangeFor('2026-12-12'), { cycle_index: cycles.monthOrdinal('2026-12-12'), start: '2026-12-12', end: '2027-01-11', label: 'ديسمبر 2026', year: 2026, month: 12 });
  assert.strictEqual(cycles.cycleRangeFor('2027-01-11').cycle_index, cycles.monthOrdinal('2026-12-12'));
  assert.strictEqual(cycles.cycleRangeFor('2027-01-12').cycle_index, cycles.monthOrdinal('2027-01-12'));
  assert.strictEqual(cycles.cycleRangeFor('2026-01-05').start, '2025-12-12', 'دورة جانفي تبدأ في ديسمبر السنة السابقة');
});

test('لا حد لعدد الدورات ولا تاريخ بداية', () => {
  assert.strictEqual(cycles.cycleRangeFor('2030-01-12').start, '2030-01-12');
  assert.strictEqual(cycles.cycleRangeFor('2030-01-12').cycle_index, cycles.monthOrdinal('2030-01-12'));
  assert.ok(cycles.monthOrdinal('2020-05-12') < cycles.monthOrdinal('2035-05-12'));
});

test('التاريخ يحسب بتوقيت الجزائر (UTC+1) لا بتوقيت الجهاز', () => {
  // 2026-10-04T22:30:00Z = 2026-10-04 23:30 في الجزائر => نفس اليوم
  assert.strictEqual(cycles.today(new Date('2026-10-04T22:30:00Z')), '2026-10-04');
  // 2026-10-04T23:30:00Z = 2026-10-05 00:30 في الجزائر => اليوم التالي
  assert.strictEqual(cycles.today(new Date('2026-10-04T23:30:00Z')), '2026-10-05');
  assert.strictEqual(cycles.today(new Date('2026-10-04T21:59:59Z')), '2026-10-04');
});

test('resolveCycle يحدد دورة أي يوم (ولا يُرجع null لأي تاريخ)', () => {
  for (let i = 0; i < 400; i++) {
    const iso = new Date(Date.UTC(2024, 0, 1 + i * 3)).toISOString().slice(0, 10);
    const r = cycles.resolveCycle(iso);
    assert.ok(r, iso);
    assert.ok(r.start <= iso && iso <= r.end, iso + ' → ' + r.start + '..' + r.end);
    assert.strictEqual(r.anchor_date, r.start, 'anchor_date = بداية الدورة نفسها');
  }
  assert.strictEqual(cycles.resolveCycle('2026-09-11').start, '2026-08-12');
  assert.strictEqual(cycles.resolveCycle('2026-09-12').start, '2026-09-12');
});

// ==================== 2) اختبارات قاعدة البيانات (داخل معاملة تُلغى دائماً) ====================

// تاريخ مستقبلي معزول: لا يلمس بيانات الإنتاج ويُنشأ ثم يُحذف بالتراجع
const TEST_TODAY = '2030-03-20'; // =>  2030-03-12 -> 2030-04-11 (دورة مارس داخل السنة الدراسية)
const ROLLBACK = Symbol('rollback');

async function cleanupTestCycles() {
  // سجل الإنتاج = سبتمبر 2026 ← ماي 2027 فقط؛ أي دورة بعد ذلك أو قبله أثر اختبار
  const junk = await db.prepare('SELECT id FROM payment_cycles WHERE start_date >= ? OR start_date < ?').all('2027-06-01', '2026-09-12');
  for (const c of junk) {
    await db.prepare('DELETE FROM payment_audit WHERE cycle_id = ?').run(c.id);
    await db.prepare('DELETE FROM cycle_payments WHERE cycle_id = ?').run(c.id);
    await db.prepare('DELETE FROM payment_cycles WHERE id = ?').run(c.id);
  }
}

async function inRollback(fn) {
  let out;
  try {
    // db.transaction(fn) يُرجع دالة يجب استدعاؤها
    const tx = db.transaction(async () => {
      out = await fn();
      throw ROLLBACK; // إجبار التراجع حتى لا يبقى أي أثر
    });
    await tx();
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  } finally {
    // شبكة أمان: أي تسريب من المعاملة لا يبقى في قاعدة الإنتاج
    await cleanupTestCycles();
  }
  return out;
}

test('إنشاء دورة جديدة يُدخل سجل UNPAID لكل تلميذ نشط', async () => {
  await inRollback(async () => {
    const activeCount = Number((await db.prepare('SELECT COUNT(*) AS c FROM students WHERE status = 1').get()).c);
    assert.ok(activeCount > 0, 'يجب وجود تلاميذ نشطين للاختبار');

    const cycle = await cycles.getOrCreateCurrentCycle(TEST_TODAY);
    assert.strictEqual(cycle.cycle_index, cycles.monthOrdinal('2030-03-12'), 'رقم الدورة = رقم الشهر المطلق');
    assert.strictEqual(cycle.anchor_date, cycle.start_date, 'anchor_date = بداية الدورة');
    assert.strictEqual(cycle.start_date, '2030-03-12');
    assert.strictEqual(cycle.end_date, '2030-04-11');

    const stats = await cycles.getCycleStats(cycle.id);
    assert.strictEqual(stats.total, activeCount);
    assert.strictEqual(stats.unpaid, activeCount);
    assert.strictEqual(stats.paid, 0);
    // دورة 2030 مستقبلية بالنسبة لتاريخ اليوم (2026) ⇒ لا تُعتبر الجارية
    assert.strictEqual(stats.is_future, true);
    assert.strictEqual(stats.is_current, false);

    // الدورة الجارية الحقيقية (تحتوي تاريخ اليوم) تُعلَّم كجارية
    const realCurrent = await cycles.getOrCreateCurrentCycle();
    const realStats = await cycles.getCycleStats(realCurrent.id);
    assert.strictEqual(realStats.is_current, true);
    assert.strictEqual(realStats.total, activeCount);
  });
});

test('إنشاء الدورة متكرر (idempotent) — لا تكرار ولا بطء في الدورات', async () => {
  await inRollback(async () => {
    const countCyclesUpToTest = async () => Number((await db.prepare(
      "SELECT COUNT(*) AS c FROM payment_cycles WHERE start_date <= '2030-03-12'"
    )).get().c);
    const before = await countCyclesUpToTest();

    const first = await cycles.getOrCreateCurrentCycle(TEST_TODAY);
    const countAfterFirst = await countCyclesUpToTest();
    const second = await cycles.getOrCreateCurrentCycle(TEST_TODAY);
    const countAfterSecond = await countCyclesUpToTest();

    assert.strictEqual(first.id, second.id, 'نفس الدورة');
    assert.strictEqual(countAfterFirst, countAfterSecond, 'لا دورات مكررة');
    assert.strictEqual(countAfterSecond, before + 1, 'أُضيفت الدورة الناقصة فقط (لا فجوات)');

    const dup = await db.prepare('SELECT start_date, COUNT(*) AS c FROM payment_cycles GROUP BY start_date HAVING COUNT(*) > 1').all();
    assert.deepStrictEqual(dup, [], 'لا يوجد تاريخ بداية مكرر');
  });
});

test('عمود "الأشهر التي لم يدفعها": كل الدورات غير المدفوعة بالأقدم ← الأحدث', async () => {
  await inRollback(async () => {
    const base = cycles.monthOrdinal('2030-01-12');
    const jan = await cycles.ensureCycleAtIndex(base);
    const feb = await cycles.ensureCycleAtIndex(base + 1);
    const mar = await cycles.ensureCycleAtIndex(base + 2);
    await cycles.ensureRoster(jan.id);
    await cycles.ensureRoster(feb.id);
    await cycles.ensureRoster(mar.id);

    const studentId = Number((await db.prepare('SELECT id FROM students WHERE status = 1 ORDER BY id LIMIT 1').get()).id);
    await cycles.recordPayment({ studentId, cycleId: mar.id, amount: 1000, userId: 1, paidAt: '2026-09-18' });

    // نعتبر منتصف مارس 2030 هو "اليوم" لعرض ثلاث دورات بدأت فعلاً
    const list = await cycles.getUnpaidStudents(jan.id, { per_page: 500 });
    const me = (await cycles.attachUnpaidMonths(list.rows, '2030-03-15')).find(r => Number(r.student_id) === studentId);
    assert.ok(me, 'الطالب غير المسدد في جانفي يظهر في القائمة');
    assert.strictEqual(me.unpaid_months_count, me.unpaid_months.length, 'العدد يطابق طول القائمة');

    const labels = me.unpaid_months.map(m => m.label);
    assert.ok(labels.includes('جانفي 2030') && labels.includes('فيفري 2030'), 'كل الدورات غير المدفوعة تظهر');
    assert.ok(!labels.includes('مارس 2030'), 'مارس 2030 مدفوع فلا يظهر');
    const starts = me.unpaid_months.map(m => m.start_date);
    assert.deepStrictEqual(starts, [...starts].sort(), 'الترتيب من الأقدم إلى الأحدث');
    const picked = me.unpaid_months.filter(m => [jan.id, feb.id].includes(m.cycle_id)).map(m => m.label);
    assert.deepStrictEqual(picked, ['جانفي 2030', 'فيفري 2030'], 'الشهور مرتبة من الأقدم إلى الأحدث');

    // تسجيل دفع لشهر قديم يُخرج الشهر من القائمة دون حذف أي سجل
    await cycles.recordPayment({ studentId, cycleId: feb.id, amount: 1000, userId: 1, paidAt: '2026-09-19' });
    const after = (await cycles.attachUnpaidMonths(list.rows, '2030-03-15')).find(r => Number(r.student_id) === studentId);
    const labels2 = after.unpaid_months.map(m => m.label);
    assert.ok(labels2.includes('جانفي 2030'), 'الشهر غير المدفوع باقٍ');
    assert.ok(!labels2.includes('فيفري 2030'), 'الشهر المدفوع حديثاً خرج من القائمة');
    assert.strictEqual(after.unpaid_months_count, me.unpaid_months_count - 1, 'العدد نقص واحداً');

    const kept = await db.prepare('SELECT status FROM cycle_payments WHERE student_id = ? AND cycle_id = ?').get(studentId, feb.id);
    assert.strictEqual(kept.status, 'PAID', 'سجل الدفع محفوظ (لا حذف)');
  });
});

test('الدفع على دورة لا يؤثر على الدورات الأخرى', async () => {
  await inRollback(async () => {
    const cycle = await cycles.getOrCreateCurrentCycle(TEST_TODAY);
    const cur = cycles.cycleRangeFor(TEST_TODAY);
    const prev = await cycles.ensureCycleAtIndex(cur.cycle_index - 1);
    const next = await cycles.ensureCycleAtIndex(cur.cycle_index + 1);
    await cycles.ensureRoster(prev.id);
    await cycles.ensureRoster(next.id);

    const stu = (await db.prepare('SELECT id FROM students WHERE status = 1 ORDER BY id LIMIT 1').get()).id;
    await cycles.recordPayment({ studentId: stu, cycleId: cycle.id, amount: 3000, userId: 1 });

    assert.strictEqual((await cycles.getCycleStats(cycle.id)).paid, 1);
    assert.strictEqual((await cycles.getCycleStats(prev.id)).paid, 0, 'الدورة السابقة تبقى غير مدفوعة');
    assert.strictEqual((await cycles.getCycleStats(next.id)).paid, 0, 'الدورة التالية تبقى غير مدفوعة');
    assert.strictEqual((await cycles.getCycleStats(prev.id)).unpaid, (await cycles.getCycleStats(cycle.id)).total);
  });
});

test('منع الدفع المكرر: صف واحد فقط لكل (تلميذ + دورة)', async () => {
  await inRollback(async () => {
    const cycle = await cycles.getOrCreateCurrentCycle(TEST_TODAY);
    const stu = (await db.prepare('SELECT id FROM students WHERE status = 1 ORDER BY id DESC LIMIT 1').get()).id;

    await cycles.recordPayment({ studentId: stu, cycleId: cycle.id, amount: 3000, userId: 1 });
    await cycles.recordPayment({ studentId: stu, cycleId: cycle.id, amount: 3500, userId: 1 });
    await cycles.recordPayment({ studentId: stu, cycleId: cycle.id, amount: 3500, userId: 1 });

    const rows = await db.prepare('SELECT * FROM cycle_payments WHERE student_id = ? AND cycle_id = ?').all(stu, cycle.id);
    assert.strictEqual(rows.length, 1, 'سجل واحد فقط');
    assert.strictEqual(Number(rows[0].amount), 3500, 'آخر مبلغ هو المعتمد');
    assert.strictEqual((await cycles.getCycleStats(cycle.id)).paid, 1);
  });
});

test('تاريخ الدفع: يُقبل يدوياً ويُحفظ، ويرفض الصيغة الخاطئة وتاريخ المستقبل', async () => {
  await inRollback(async () => {
    const cycle = await cycles.getOrCreateCurrentCycle(TEST_TODAY);
    const stu = (await db.prepare('SELECT id FROM students WHERE status = 1 ORDER BY id LIMIT 1').get()).id;

    const saved = await cycles.recordPayment({ studentId: stu, cycleId: cycle.id, amount: 1000, userId: 1, paidAt: '2026-09-18' });
    assert.strictEqual(saved.paid_at, '2026-09-18', 'التاريخ المُدخل يُحفظ كما هو');

    const withTime = await cycles.recordPayment({ studentId: stu, cycleId: cycle.id, amount: 1000, userId: 1, paidAt: '2026-09-19 06:49:40' });
    assert.strictEqual(withTime.paid_at, '2026-09-19', 'الوقت يُتجاهل ويُحفظ التاريخ فقط');

    await assert.rejects(
      () => cycles.recordPayment({ studentId: stu, cycleId: cycle.id, amount: 1000, userId: 1, paidAt: '18/09/2026' }),
      /غير صالح/
    );
    await assert.rejects(
      () => cycles.recordPayment({ studentId: stu, cycleId: cycle.id, amount: 1000, userId: 1, paidAt: '2999-01-01' }),
      /المستقبل/
    );
  });
});

test('دفع متأخر على دورة سابقة: يُسجَّل في تلك الدورة فقط', async () => {
  await inRollback(async () => {
    const current = await cycles.getOrCreateCurrentCycle();
    const next = await cycles.ensureCycleAtIndex(current.cycle_index + 1);
    await cycles.ensureRoster(next.id);
    const stu = (await db.prepare('SELECT id FROM students WHERE status = 1 ORDER BY id LIMIT 1').get()).id;

    // دفعة متأخرة على الدورة السابقة بتاريخ داخلها (لا يتجاوز تاريخ اليوم)
    await cycles.recordPayment({ studentId: stu, cycleId: current.id, amount: 3000, userId: 1, paidAt: current.start_date });

    const history = await cycles.getStudentPaymentHistory(stu);
    const row = history.cycles.find(c => c.cycle_id === current.id);
    assert.strictEqual(row.status, 'PAID', 'الدورة السابقة صارت مدفوعة');
    assert.strictEqual(row.paid_at, current.start_date, 'تاريخ الدفع المتأخر محفوظ');
    assert.strictEqual(history.cycles.find(c => c.cycle_id === next.id).status, 'UNPAID', 'الدورة التالية لم تتأثر');

    const paidRow = (await db.prepare('SELECT status FROM cycle_payments WHERE student_id = ? AND cycle_id = ?').get(stu, current.id)).status;
    const unpaidRow = (await db.prepare('SELECT status FROM cycle_payments WHERE student_id = ? AND cycle_id = ?').get(stu, next.id)).status;
    assert.strictEqual(paidRow, 'PAID');
    assert.strictEqual(unpaidRow, 'UNPAID', 'سجل الدورة التالية بقي غير مسدد');
  });
});

test('إلغاء الدفع لا يحذف السجل ولا التاريخ (audit محفوظ)', async () => {
  await inRollback(async () => {
    const cycle = await cycles.getOrCreateCurrentCycle(TEST_TODAY);
    const stu = (await db.prepare('SELECT id FROM students WHERE status = 1 ORDER BY id LIMIT 2').all()).at(-1).id;

    await cycles.recordPayment({ studentId: stu, cycleId: cycle.id, amount: 3000, userId: 1 });
    await cycles.cancelPayment({ studentId: stu, cycleId: cycle.id, userId: 1, reason: 'تصحيح' });

    const rows = await db.prepare('SELECT * FROM cycle_payments WHERE student_id = ? AND cycle_id = ?').all(stu, cycle.id);
    assert.strictEqual(rows.length, 1, 'السجل ما زال موجوداً');
    assert.strictEqual(rows[0].status, 'UNPAID');

    const audit = await db.prepare('SELECT * FROM payment_audit WHERE student_id = ? AND cycle_id = ? ORDER BY id').all(stu, cycle.id);
    // السجل موجود مسبقاً كـUNPAID ضمن كشف الدورة، فالتسجيل الأول يُسجَّل كـUPDATE
    assert.strictEqual(audit.length, 2);
    assert.ok(['RECORD', 'UPDATE'].includes(audit[0].action), 'إجراء أول = ' + audit[0].action);
    assert.strictEqual(audit[1].action, 'CANCEL');
    assert.strictEqual(audit[1].from_status, 'PAID');
    assert.strictEqual(audit[1].to_status, 'UNPAID');
    assert.strictEqual((await cycles.getCycleStats(cycle.id)).paid, 0);
  });
});

test('Pagination والفلترة (بحث/مستوى) تعمل', async () => {
  await inRollback(async () => {
    const cycle = await cycles.getOrCreateCurrentCycle(TEST_TODAY);
    const stats = await cycles.getCycleStats(cycle.id);

    const p1 = await cycles.getUnpaidStudents(cycle.id, { page: 1, per_page: 5 });
    assert.strictEqual(p1.rows.length, 5);
    assert.strictEqual(p1.total, stats.unpaid);
    assert.strictEqual(p1.pages, Math.ceil(stats.unpaid / 5));

    const p2 = await cycles.getUnpaidStudents(cycle.id, { page: 2, per_page: 5 });
    assert.notDeepStrictEqual(p1.rows.map(r => r.student_id), p2.rows.map(r => r.student_id));

    const target = (await db.prepare('SELECT id, reg_number FROM students WHERE status = 1 LIMIT 1').get());
    const found = await cycles.getUnpaidStudents(cycle.id, { q: target.reg_number, per_page: 50 });
    assert.strictEqual(found.total, 1);
    assert.strictEqual(found.rows[0].student_id, target.id);

    const lvl = await db.prepare('SELECT level_id FROM students WHERE status = 1 LIMIT 1').get();
    const byLevel = await cycles.getUnpaidStudents(cycle.id, { level_id: lvl.level_id, per_page: 200 });
    assert.ok(byLevel.rows.every(r => String(r.level_name !== undefined)));
  });
});

test('تلميذ جديد يُدرج كغير مسدد في الدورة الحالية', async () => {
  await inRollback(async () => {
    const cycle = await cycles.getOrCreateCurrentCycle(TEST_TODAY);
    const levelId = (await db.prepare('SELECT id FROM levels ORDER BY id LIMIT 1').get()).id;
    const uname = `zz-${Date.now()}`;
    const u = await db.prepare("INSERT INTO users (username, password_hash, role, active) VALUES (?, 'x', 'ROLE_STUDENT', 1)").run(uname);
    const s = await db.prepare(
      'INSERT INTO students (user_id, first_name, last_name, reg_number, level_id, status) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(u.lastInsertRowid, 'تلميذ', 'اختبار', uname, levelId);
    const newId = s.lastInsertRowid;

    await cycles.attachStudentToCycle(newId, cycle.id);
    await cycles.attachStudentToCycle(newId, cycle.id); // idempotent
    await cycles.ensureRoster(cycle.id);

    const rows = await db.prepare('SELECT * FROM cycle_payments WHERE student_id = ? AND cycle_id = ?').all(newId, cycle.id);
    assert.strictEqual(rows.length, 1, 'سجل واحد فقط');
    assert.strictEqual(rows[0].status, 'UNPAID');
  });
});

test('قائمة الدفع: ترتيب رقمي حسب رقم التسجيل + بقاء الطالب بعد الدفع', async () => {
  await inRollback(async () => {
    const cycle = await cycles.getOrCreateCurrentCycle();
    await cycles.ensureRoster(cycle.id);

    // تلاميذ بأرقام تسجيل نصية: 001, 002, 003, 010, 011, 020 (ترتيب رقمي لا أبجدي)
    const levelId = (await db.prepare('SELECT id FROM levels ORDER BY id LIMIT 1').get()).id;
    const regs = ['001', '002', '003', '010', '011', '020'];
    const ids = [];
    for (const reg of regs) {
      const u = await db.prepare("INSERT INTO users (username, password_hash, role, active) VALUES (?, 'x', 'ROLE_STUDENT', 1)").run(`zz-${reg}-${Date.now()}`);
      const s = await db.prepare(
        'INSERT INTO students (user_id, first_name, last_name, reg_number, level_id, status) VALUES (?, ?, ?, ?, ?, 1)'
      ).run(u.lastInsertRowid, 'تلميذ', 'zzsort', reg, levelId);
      ids.push(Number(s.lastInsertRowid));
      await cycles.attachStudentToCycle(Number(s.lastInsertRowid), cycle.id);
    }

    const list = await cycles.getUnpaidStudents(cycle.id, { q: 'zzsort', per_page: 200 });
    const mine = list.rows.filter(r => ids.includes(Number(r.student_id)));
    assert.strictEqual(mine.length, 6, 'كل التلاميذ موجودون في القائمة');
    assert.deepStrictEqual(mine.map(r => r.reg_number), regs, 'الترتيب تصاعدي رقمياً (002 قبل 010)');
    assert.ok(mine.every(r => r.payment_status === 'UNPAID'), 'الجميع غير مسدد في البداية');

    // تسجيل دفع للتلميذ 003: يبقى في مكانه بنفس الترتيب وتتحول حالته فقط
    const target = mine.find(r => r.reg_number === '003');
    await cycles.recordPayment({ studentId: Number(target.student_id), cycleId: cycle.id, amount: 1000, userId: 1, paidAt: cycles.today() });

    const after = await cycles.getUnpaidStudents(cycle.id, { q: 'zzsort', per_page: 200 });
    const afterMine = after.rows.filter(r => ids.includes(Number(r.student_id)));
    assert.deepStrictEqual(afterMine.map(r => r.reg_number), regs, 'الترتيب لم يتغيّر بعد الدفع');
    const t2 = afterMine.find(r => r.reg_number === '003');
    assert.strictEqual(t2.payment_status, 'PAID', 'الحالة صارت PAID');
    assert.strictEqual(t2.unpaid_months_count, 0, 'لم يبق شهر غير مدفوع له');
    assert.strictEqual(after.paid_total, 1);
    assert.strictEqual(after.total, 6, 'الطالب المدفوع لم يُحذف من القائمة');

    // إلغاء الدفع يعيده إلى UNPAID في نفس الموضع
    await db.prepare('UPDATE cycle_payments SET status = \'UNPAID\' WHERE student_id = ? AND cycle_id = ?').run(Number(target.student_id), cycle.id);
    const back = await cycles.getUnpaidStudents(cycle.id, { q: 'zzsort', per_page: 200 });
    const backMine = back.rows.filter(r => ids.includes(Number(r.student_id)));
    assert.deepStrictEqual(backMine.map(r => r.reg_number), regs, 'الترتيب ثابت بعد الإلغاء');
    assert.strictEqual(backMine.find(r => r.reg_number === '003').payment_status, 'UNPAID');
  });
});

test('التاريخ المُدخل يحدّد دورته وينشئ سجلات UNPAID عند الحاجة', async () => {
  await inRollback(async () => {
    // قاعدة 12 ← 11: نفس الدورة لكل تواريخها
    const a = await cycles.ensureCycleRow('2031-03-20');
    const b = await cycles.ensureCycleRow('2031-04-05');
    const c = await cycles.ensureCycleRow('2031-03-12');
    assert.strictEqual(a.id, b.id, '20/03 و 05/04 في نفس الدورة');
    assert.strictEqual(a.id, c.id, '12/03 بداية الدورة');
    assert.strictEqual(a.start_date, '2031-03-12');
    assert.strictEqual(a.end_date, '2031-04-11');

    // تكرار الطلب يعيد نفس الدورة (idempotent) بلا تكرار
    const again = await cycles.ensureCycleRow('2031-03-25');
    assert.strictEqual(again.id, a.id);

    // تُرمَّن سجلات التلاميذ كـ UNPAID
    const added = await cycles.ensureRoster(a.id);
    assert.ok(added > 0, 'أُضيفت سجلات جديدة');
    const st = await db.prepare('SELECT status, COUNT(*) AS c FROM cycle_payments WHERE cycle_id = ? GROUP BY status').all(a.id);
    assert.ok(st.every(r => r.status === 'UNPAID'), 'كل السجلات UNPAID');
    const active = Number((await db.prepare('SELECT COUNT(*) AS c FROM students WHERE status = 1').get()).c);
    assert.strictEqual(Number(st[0].c), active, 'سجل لكل تلميذ نشط');
  });
});

test('أي تاريخ (يوم واحد أو ثلاثة أو شهر كامل) يحدّد دورته بلا استثناء', () => {
  // مسح يوم بيوم على مدى 18 شهراً — لا تاريخ يُرفض ولا قاعدة تُكسر
  const start = new Date(Date.UTC(2026, 8, 1));
  const end = new Date(Date.UTC(2028, 1, 29));
  let n = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const r = cycles.resolveCycle(iso);
    const day = Number(iso.slice(8, 10));
    // بداية الدورة دائماً يوم 12، نهايتها يوم 11 من الشهر التالي
    assert.strictEqual(r.start.slice(8, 10), '12', `بداية الدورة عند ${iso}`);
    assert.strictEqual(r.end.slice(8, 10), '11', `نهاية الدورة عند ${iso}`);
    // التاريخ داخل دورته
    assert.ok(iso >= r.start && iso <= r.end, `${iso} خارج ${r.start}..${r.end}`);
    // 12..آخر الشهر ⇒ دورة الشهر نفسه، و1..11 ⇒ دورة الشهر السابق
    const m = r;
    const dm = Number(iso.slice(5, 7));
    // 12..آخر الشهر ⇒ دورة الشهر نفسه، و1..11 ⇒ دورة الشهر السابق
    const expected = day >= 12 ? dm : (dm === 1 ? 12 : dm - 1);
    assert.strictEqual(m.month, expected, `شهر الدورة عند ${iso}`);
    assert.strictEqual(m.year, (day <= 11 && dm === 1) ? Number(iso.slice(0, 4)) - 1 : Number(iso.slice(0, 4)), `سنة الدورة عند ${iso}`);
    // نفس الشهر يعطي نفس الدورة دائماً
    assert.strictEqual(cycles.resolveCycle(iso).cycle_index, r.cycle_index);
    n++;
  }
  assert.strictEqual(n, 547, 'عدد الأيام المفحوصة');
});

test('سداد عدة أشهر متأخرة دفعة واحدة + ذرّية العملية', async () => {
  const s = await svc.getOrCreateCurrentCycle();
  const students = await db.prepare('SELECT id FROM students WHERE status = 1 ORDER BY id LIMIT 1').all();
  const sid = students[0].id;
  const curK = Number(s.cycle_index);
  const t0 = cycles.nowStamp();
  try {
    await bulkScenario(sid, curK, s);
  } finally {
    // تنظيف مضمون: لا أثر للاختبار في بيانات الإنتاج
    await db.prepare("UPDATE cycle_payments SET status = 'UNPAID', amount = 0, paid_at = NULL, note = NULL WHERE student_id = ?").run(sid);
    await db.prepare('DELETE FROM payment_audit WHERE student_id = ? AND created_at >= ?').run(sid, t0);
    await cleanupTestCycles();
  }
});

async function bulkScenario(sid, curK, s) {
  // محاكاة: لم يدفع شهرين سابقين ثم جاء الشهر الحالي
  const older = cycleRangeByIndex(curK - 2);
  const prev = cycleRangeByIndex(curK - 1);
  // دورتان أقدم من السجل تُدرجان مباشرة في الاختبار (الحد الأدنى يمنع إنشاؤهما في التشغيل الفعلي)
  const synth = [];
  for (const rng of [older, prev]) {
    await db.prepare(
      `INSERT INTO payment_cycles (anchor_date, start_date, end_date, label, cycle_index)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT (start_date) DO NOTHING`
    ).run(rng.start, rng.start, rng.end, rng.label, Number(rng.cycle_index));
    const row = await db.prepare('SELECT * FROM payment_cycles WHERE start_date = ?').get(rng.start);
    assert.ok(row, 'الدورة المُحاكاة أُدرجت: ' + rng.label);
    synth.push(row);
  }
  const olderRow = synth[0];
  for (const p of [...synth, s]) {
    await db.prepare(
      `INSERT INTO cycle_payments (student_id, cycle_id, status, amount, paid_at, created_at)
       VALUES (?, ?, 'UNPAID', 0, NULL, ?)
       ON CONFLICT (student_id, cycle_id) DO UPDATE SET status = 'UNPAID', amount = 0, paid_at = NULL, note = NULL`
    ).run(sid, p.id, cycles.nowStamp());
  }

  const due = await svc.getStudentDueCycles(sid);
  assert.strictEqual(due.due.length, 3, 'ثلاثة أشهر غير مدفوعة');
  assert.deepStrictEqual(due.due.map(c => c.label), [older.label, prev.label, s.label], 'الأقدم ← الأحدث');
  assert.ok(due.due.every(c => c.status === 'UNPAID'), 'كلها غير مدفوعة');
  assert.ok(due.due.every(c => Number(c.amount || 0) === 0), 'الشهران السابقان بلا مبلغ');

  // مسداد الكل دفعة واحدة
  const rows = await svc.recordPaymentsBulk({
    studentId: sid,
    items: due.due.map(c => ({ cycle_id: c.id, amount: 3000 })),
    paidAt: cycles.today(),
    userId: 1
  });
  assert.strictEqual(rows.length, 3, 'ثلاثة سجلات سُجّلت');
  assert.ok(rows.every(r => r.status === 'PAID' && Number(r.amount) === 3000), 'كلها PAID بمبلغ 3000');

  const after = await svc.getStudentDueCycles(sid);
  assert.strictEqual(after.due.length, 0, 'لم يبقَ شيء غير مدفوع');
  assert.strictEqual(after.all.filter(c => c.status === 'PAID').length, 3, 'السجل يحفظ الثلاث دفعات');
  const audit = await db.prepare('SELECT action, to_status FROM payment_audit WHERE student_id = ? ORDER BY id').all(sid);
  assert.ok(audit.filter(a => a.to_status === 'PAID').length >= 3, 'أثر السداد محفوظ');

  // ذرّية: عنصر خاطئ → لا شيء يُحفظ
  const paidBefore = (await db.prepare("SELECT COUNT(*) AS c FROM cycle_payments WHERE student_id = ? AND status = 'PAID'").get(sid)).c;
  await assert.rejects(
    () => svc.recordPaymentsBulk({ studentId: sid, items: [{ cycle_id: due.due[0].id, status: 'PAID' }, { cycle_id: 987654321 }], userId: 1 }),
    /الدورة غير موجودة/
  );
  const paidAfter = (await db.prepare("SELECT COUNT(*) AS c FROM cycle_payments WHERE student_id = ? AND status = 'PAID'").get(sid)).c;
  assert.strictEqual(paidAfter, paidBefore, 'العملية تراجعت بالكامل');

  // رفض التكرار والتاريخ المستقبلي
  await assert.rejects(() => svc.recordPaymentsBulk({ studentId: sid, items: [], userId: 1 }), /شهراً واحداً على الأقل/);
  await assert.rejects(
    () => svc.recordPaymentsBulk({ studentId: sid, items: [{ cycle_id: due.due[0].id, amount: 100 }, { cycle_id: due.due[0].id, amount: 100 }], userId: 1 }),
    /تكرار/
  );
  await assert.rejects(
    () => svc.recordPaymentsBulk({ studentId: sid, items: [{ cycle_id: due.due[0].id, amount: 100 }], paidAt: '2099-01-01', userId: 1 }),
    /المستقبل/
  );
}

test('السنة الدراسية: من سبتمبر إلى ماي فقط (جوان/جويلية/أوت بلا دورات)', async () => {
  // كل شهر داخل السنة الدراسية يقبل دورته
  const allowed = [
    ['2026-09-15', 'سبتمبر 2026'], ['2026-10-20', 'أكتوبر 2026'], ['2026-11-05', 'أكتوبر 2026'],
    ['2026-12-25', 'ديسمبر 2026'], ['2027-01-10', 'ديسمبر 2026'], ['2027-02-14', 'فيفري 2027'],
    ['2027-03-30', 'مارس 2027'], ['2027-04-01', 'مارس 2027'], ['2027-04-12', 'أفريل 2027'],
    ['2027-05-11', 'أفريل 2027'], ['2027-05-12', 'ماي 2027'],
    ['2027-06-01', 'ماي 2027'], ['2027-06-11', 'ماي 2027'] // 1..11 جوان = دورة ماي
  ];
  for (const [iso, label] of allowed) {
    const r = cycles.resolveCycle(iso);
    assert.strictEqual(r.label, label, `${iso} → ${label}`);
  }

  // أشهر العطلة: يُرفض إنشاء دورتها
  for (const iso of ['2027-06-12', '2027-07-01', '2027-07-20', '2027-08-05', '2027-08-25', '2026-08-12']) {
    assert.strictEqual(cycles.isSchoolMonth(cycles.resolveCycle(iso).month), false, `${iso} خارج السنة الدراسية`);
    const info = cycles.describeBlockedCycle(iso);
    assert.ok(info.reason && info.reason.includes('سبتمبر'), 'رسالة واضحة: ' + info.reason);
  }

  // محاولة إنشاء دورة عطلة في السجل تُرفض
  const before = (await db.prepare('SELECT COUNT(*) AS c FROM payment_cycles').get()).c;
  assert.strictEqual(await svc.ensureCycleRow('2027-07-15'), null, 'دورة جويلية مرفوضة');
  assert.strictEqual(await svc.ensureCycleRow('2027-08-20'), null, 'دورة أوت مرفوضة');
  const after = (await db.prepare('SELECT COUNT(*) AS c FROM payment_cycles').get()).c;
  assert.strictEqual(after, before, 'لا دورات جديدة');

  // سجل الدورات كله داخل السنة الدراسية
  const stored = await db.prepare('SELECT label, start_date FROM payment_cycles').all();
  assert.ok(stored.length > 0, 'يوجد سجل دورات');
  for (const r of stored) {
    const range = cycles.resolveCycle(r.start_date);
    assert.ok(cycles.isSchoolMonth(range.month), `دورة خارج السنة الدراسية: ${r.label}`);
  }
});

test('لا تُنشأ دورة أقدم من أقدم دورة مسجّلة (حد بداية السنة الدراسية)', async () => {
  const first = await db.prepare('SELECT MIN(start_date) AS s FROM payment_cycles').get();
  assert.ok(first.s, 'يوجد سجل دورات');
  const before = (await db.prepare('SELECT COUNT(*) AS c FROM payment_cycles').get()).c;
  // تاريخ داخل أول شهر من أول دورة (1..11) يقع في دورة أقدم
  const olderIso = cycleRangeByIndex(cycleRangeFor(first.s).cycle_index - 1).start;
  const blocked = await svc.ensureCycleRow(olderIso);
  assert.strictEqual(blocked, null, 'رُفض إنشاء دورة أقدم');
  const after = (await db.prepare('SELECT COUNT(*) AS c FROM payment_cycles').get()).c;
  assert.strictEqual(after, before, 'عدد الدورات لم يتغير');
  // لكن التواريخ داخل السجل تعمل
  const ok = await svc.ensureCycleRow(first.s);
  assert.ok(ok && ok.start_date === first.s, 'أول دورة في السجل تعمل');
});

test('الدورات تُبنى بالقاعدة (12 ← 11) دون فجوات ولا تاريخ بداية', async () => {
  await inRollback(async () => {
    const minBefore = Number((await db.prepare('SELECT MIN(cycle_index) AS m FROM payment_cycles').get()).m);
    const cur = await cycles.getOrCreateCurrentCycle(TEST_TODAY);
    const first = Math.min(minBefore, Number(cur.cycle_index));
    const rows = await db.prepare(
      'SELECT cycle_index, start_date, end_date FROM payment_cycles WHERE cycle_index >= ? AND cycle_index <= ? ORDER BY cycle_index'
    ).all(first, Number(cur.cycle_index));

    // كل شهر دراسي (سبتمبر ← ماي) بين أقدم دورة والحالية موجود بلا فجوات
    // (جوان/جويلية/أوت عطلة ⇒ لا دورات لها)
    const expected = [];
    for (let k = first; k <= Number(cur.cycle_index); k++) {
      const r = cycles.cycleRangeByIndex(k);
      if (cycles.isSchoolMonth(r.month)) expected.push(r);
    }
    assert.deepStrictEqual(rows.map(r => r.start_date), expected.map(r => r.start), 'كل شهر دراسي موجود بلا فجوات');
    for (let i = 0; i < expected.length; i++) {
      assert.strictEqual(Number(rows[i].cycle_index), expected[i].cycle_index);
      assert.strictEqual(rows[i].start_date, expected[i].start);
      assert.strictEqual(rows[i].end_date, expected[i].end);
      // كل دورة تبدأ في اليوم 12 وتنتهي في اليوم 11
      assert.strictEqual(Number(rows[i].start_date.slice(8, 10)), 12);
      assert.strictEqual(Number(rows[i].end_date.slice(8, 10)), 11);
    }
    // أول دورة مسجّلة في الإنتاج لها anchor_date = بدايتها (بعد التطبيع)
    const anyOld = await db.prepare('SELECT anchor_date, start_date FROM payment_cycles ORDER BY start_date LIMIT 1').get();
    assert.strictEqual(anyOld.anchor_date, anyOld.start_date);
  });
});
