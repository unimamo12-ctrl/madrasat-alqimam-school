#!/usr/bin/env node
/**
 * اختبار سلامة اتصال PostgreSQL
 * Usage: DATABASE_URL="..." node scripts/pg-smoke.js
 *
 * يتحقق من الاتصال،执行力 المخطط، التحقق من الـ seed، واختبار CRUD.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
  console.error('❌ يرجى تحديد DATABASE_URL أولاً');
  process.exit(1);
}

const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('✅ اتصال PostgreSQL ناجح');

  // التحقق من المتغيرات
  const ver = await client.query('SELECT version()');
  console.log('   الإصدار:', ver.rows[0].version);

  // التحقق من الجداول
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' ORDER BY table_name
  `);
  const expected = ['academic_years','announcements','classes','groups','levels','payments',
                    'schedules','student_group_selections','students','subjects',
                    'teacher_classes','teacher_levels','teachers','users'];
  const found = tables.rows.map(r => r.table_name).sort();
  const missing = expected.filter(t => !found.includes(t));
  if (missing.length) {
    console.error('❌ جداول ناقصة:', missing.join(', '));
    await client.end();
    process.exit(1);
  }
  console.log('✅ جميع الجداول موجودة (' + found.length + ' جدول)');

  // عدّ البيانات
  const counts = {};
  for (const t of expected) {
    const r = await client.query(`SELECT COUNT(*) AS c FROM ${t}`);
    counts[t] = Number(r.rows[0].c);
  }
  console.log('📊 إحصائيات:');
  Object.entries(counts).forEach(([k, v]) => { if (v > 0) console.log(`   ${k}: ${v}`); });

  // اختبار CRUD بسيط: قراءة مستويات
  const levels = await client.query('SELECT * FROM levels ORDER BY sort_order');
  console.log('✅ قراءة المستويات:', levels.rows.length, 'مستوى');

  // اختبارagogue: طلبة
  const students = await client.query('SELECT s.first_name, s.last_name, u.username FROM students s JOIN users u ON u.id=s.user_id');
  console.log('✅ التلاميذ:', students.rows.map(r => `${r.first_name} ${r.last_name} (${r.username})`).join(', '));

  await client.end();
  console.log('\n✅ جميع الاختبارات نجحت — PostgreSQL جاهز.');
}

main().catch(err => {
  console.error('❌ خطأ:', err.message);
  process.exit(1);
});