"use strict";
// ترحيل الدفعات القديمة (payments بـ month_index) إلى نظام الدورات (cycle_payments).
// - القاعدة العامة: كل دورة من اليوم 12 إلى اليوم 11 (لا تاريخ ارت��از مثبّت)
// - month_index القديم 0..8 = سبتمبر..ماي، وسنته الدراسية تُشتق من سنة البيانات نفسها
// - لا يحذف أي بيانات، ولا يغيّر أي سجل سبق تدوينه يدوياً
// - آمن للتكرار (idempotent): لا يعيد الكتابة على سجل مدفوع أو ملغى
// التشغيل:  node scripts/migrate-legacy-payments.js

require('dotenv').config();
const db = require('../db/database');
const cycles = require('../services/paymentCycle.service');

function legacyAmount(p) {
  const n = parseFloat(String(p.note || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// تطبيع أي دورات قديمة: anchor_date = بداية دورتها، و cycle_index = رقم شهر مطلق
async function normalizeExistingCycles() {
  const rows = await db.prepare('SELECT id, anchor_date, start_date, cycle_index FROM payment_cycles').all();
  let fixed = 0;
  for (const c of rows) {
    const want = cycles.cycleRangeFor(c.start_date);
    if (c.anchor_date === want.start && Number(c.cycle_index) === want.cycle_index) continue;
    await db.prepare('UPDATE payment_cycles SET anchor_date = ?, cycle_index = ? WHERE id = ?')
      .run(want.start, want.cycle_index, c.id);
    fixed++;
  }
  return fixed;
}

async function main() {
  await db.init();

  const normalized = await normalizeExistingCycles();
  if (normalized) console.log(`دورات مطبَّعة على القاعدة (12 ← 11): ${normalized}`);

  const legacy = await db.prepare('SELECT * FROM payments ORDER BY student_id, month_index').all();
  if (!legacy.length) {
    console.log('لا توجد دفعات قديمة للترحيل.');
    return;
  }

  // السنة الدراسية للبيانات القديمة تُشتق من أول تاريخ دفع مسجّل (سبتمبر = month_index 0)
  const dated = legacy
    .map(p => String(p.payment_date || '').slice(0, 10))
    .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
    .sort();
  const refYear = dated.length ? Number(dated[0].slice(0, 4)) : Number(cycles.today().slice(0, 4));
  const baseCycle = cycles.cycleRangeFor(`${refYear}-09-12`);
  console.log(`سنة الدورات القديمة: ${refYear} (الدورة 0 = ${baseCycle.label} ${baseCycle.start} ← ${baseCycle.end})`);

  const usedCycles = new Set();
  let migrated = 0, skipped = 0, audited = 0;

  for (const p of legacy) {
    const cycle = await cycles.ensureCycleAtIndex(baseCycle.cycle_index + Number(p.month_index));
    usedCycles.add(cycle.id);
    const paid = Number(p.is_paid) === 1;
    const amount = paid ? legacyAmount(p) : null;
    const paidAt = paid ? (p.payment_date || p.updated_at || null) : null;

    const before = await db.prepare(
      'SELECT * FROM cycle_payments WHERE student_id = ? AND cycle_id = ?'
    ).get(p.student_id, cycle.id);

    const res = await db.prepare(
      `INSERT INTO cycle_payments (student_id, cycle_id, status, amount, paid_at, created_by, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (student_id, cycle_id) DO UPDATE SET
         status = 'PAID', amount = EXCLUDED.amount, paid_at = EXCLUDED.paid_at,
         created_by = EXCLUDED.created_by, updated_at = EXCLUDED.updated_at
       WHERE EXCLUDED.status = 'PAID'
         AND cycle_payments.status = 'UNPAID'
         AND cycle_payments.paid_at IS NULL
         AND cycle_payments.amount IS NULL`
    ).run(p.student_id, cycle.id, paid ? 'PAID' : 'UNPAID', amount, paidAt,
      p.created_by || null, p.note || null, cycles.nowStamp(), cycles.nowStamp());

    const changed = res.changes || 0;
    if (changed > 0) {
      migrated++;
      if (paid) {
        const row = await db.prepare('SELECT * FROM cycle_payments WHERE student_id = ? AND cycle_id = ?').get(p.student_id, cycle.id);
        await db.prepare(
          `INSERT INTO payment_audit (cycle_payments_id, cycle_id, student_id, action, from_status, to_status, amount, user_id, created_at)
           VALUES (?, ?, ?, 'MIGRATE', ?, 'PAID', ?, ?, ?)`
        ).run(row.id, cycle.id, p.student_id, before ? before.status : null, amount, p.created_by || null, cycles.nowStamp());
        audited++;
      }
    } else {
      skipped++;
    }
  }

  for (const id of usedCycles) await cycles.ensureRoster(id);

  const totalCycles = await db.prepare('SELECT COUNT(*) AS c FROM payment_cycles').get();
  const totalRows = await db.prepare('SELECT COUNT(*) AS c FROM cycle_payments').get();
  const paidRows = await db.prepare("SELECT COUNT(*) AS c FROM cycle_payments WHERE status = 'PAID'").get();

  console.log('تم الترحيل:');
  console.log(`  دفعات قديمة: ${legacy.length}`);
  console.log(`  مُرحَّلة/محدَّثة: ${migrated}`);
  console.log(`  متخطاة (سبق تسجيلها): ${skipped}`);
  console.log(`  سجلات دفع مدفوعة في النظام الجديد: ${paidRows.c}`);
  console.log(`  عدد الدورات: ${totalCycles.c} | سجلات cycle_payments: ${totalRows.c}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('فشل الترحيل:', e.message); process.exit(1); });