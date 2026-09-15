const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'school.db');
const db = new DatabaseSync(dbPath);

const results = [];

try {
  db.exec('BEGIN IMMEDIATE');

  // 1. Restore group 20 schedule: day → الجمعة, 08:00–10:00
  const grpUpd = db.prepare('UPDATE groups SET day = ?, start_time = ?, end_time = ? WHERE id = 20')
    .run('الجمعة', '08:00', '10:00');
  results.push(`groups id=20 restored: ${grpUpd.changes} row(s)`);

  // 2. Restore schedules row for group 20: same
  const schUpd = db.prepare('UPDATE schedules SET day = ?, start_time = ?, end_time = ? WHERE group_id = 20')
    .run('الجمعة', '08:00', '10:00');
  results.push(`schedules (group 20) restored: ${schUpd.changes} row(s)`);

  // 3. Restore payment id=1: is_paid=1, payment_date='15/09/2026'
  const pay1Upd = db.prepare('UPDATE payments SET is_paid = 1, payment_date = ? WHERE id = 1')
    .run('15/09/2026');
  results.push(`payment id=1 restored: ${pay1Upd.changes} row(s)`);

  // 4. Restore payment id=23: is_paid=0, payment_date=null
  const pay23Upd = db.prepare('UPDATE payments SET is_paid = 0, payment_date = NULL, updated_at = NULL WHERE id = 23')
    .run();
  results.push(`payment id=23 restored: ${pay23Upd.changes} row(s)`);

  // 4b. Restore payment id=1 updated_at timestamp
  db.prepare('UPDATE payments SET updated_at = ? WHERE id = 1').run('2026-09-15 02:38:53');
  results.push('payment id=1 updated_at restored');

  // 5. Delete test payments for student 28 (PGTEST1)
  const payDel = db.prepare('DELETE FROM payments WHERE student_id = 28').run();
  results.push(`test payments deleted: ${payDel.changes} row(s)`);

  // 6. Delete test selection id=6
  const selDel = db.prepare('DELETE FROM student_group_selections WHERE student_id = 28').run();
  results.push(`test selections deleted: ${selDel.changes} row(s)`);

  // 7. Delete test student id=28
  const studDel = db.prepare('DELETE FROM students WHERE id = 28').run();
  results.push(`test student deleted: ${studDel.changes} row(s)`);

  // 8. Delete test user id=29
  const userDel = db.prepare('DELETE FROM users WHERE id = 29').run();
  results.push(`test user deleted: ${userDel.changes} row(s)`);

  db.exec('COMMIT');
  results.push('\n✓ All test data restored/removed successfully.');
} catch (e) {
  db.exec('ROLLBACK');
  results.push(`\n✗ Error: ${e.message}\nRolled back.`);
} finally {
  db.close();
}

console.log(results.join('\n'));