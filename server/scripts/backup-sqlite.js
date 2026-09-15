#!/usr/bin/env node
/**
 * نسخة احتياطية من قاعدة البيانات SQLite
 * Usage: node scripts/backup-sqlite.js
 *
 * يُنشئ نسخة في server/backups/school-YYYYMMDD-HHMMSS.db
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data', 'school.db');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ ملف school.db غير موجود:', DB_PATH);
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const now = new Date();
const ts = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
  '-',
  String(now.getHours()).padStart(2, '0'),
  String(now.getMinutes()).padStart(2, '0'),
  String(now.getSeconds()).padStart(2, '0')
].join('');
const BACKUP_PATH = path.join(BACKUP_DIR, `school-${ts}.db`);

try {
  const db = new DatabaseSync(DB_PATH);
  db.exec(`VACUUM INTO '${BACKUP_PATH.replace(/\\/g, '\\\\')}'`);
  db.close();
  const stat = fs.statSync(BACKUP_PATH);
  console.log('✅ نسخة احتياطية نجحت:');
  console.log('   المسار:', BACKUP_PATH);
  console.log('   الحجم:', (stat.size / 1024).toFixed(1), 'KB');

  // معلومات مختصرة عن البيانات
  const db2 = new DatabaseSync(DB_PATH);
  const counts = {
    users: db2.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    students: db2.prepare('SELECT COUNT(*) AS c FROM students').get().c,
    teachers: db2.prepare('SELECT COUNT(*) AS c FROM teachers').get().c,
    groups: db2.prepare('SELECT COUNT(*) AS c FROM groups').get().c,
    selections: db2.prepare('SELECT COUNT(*) AS c FROM student_group_selections').get().c,
    payments: db2.prepare('SELECT COUNT(*) AS c FROM payments').get().c,
  };
  db2.close();
  console.log('   البيانات:', JSON.stringify(counts));
} catch (err) {
  console.error('❌ فشل النسخ الاحتياطي:', err.message);
  process.exit(1);
}
