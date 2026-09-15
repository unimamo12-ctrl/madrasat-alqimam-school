const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'school.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ======================= Migrations =======================
// إضافة عمود phone للتلاميذ في قواعد البيانات القديمة
function migrate() {
  const cols = db.prepare('PRAGMA table_info(students)').all().map(c => c.name);
  if (!cols.includes('phone')) {
    db.exec('ALTER TABLE students ADD COLUMN phone TEXT');
  }
}
migrate();

// مُعادلة بـ better-sqlite3: db.transaction(fn) -> fn مغلّفة بمعاملة
db.transaction = function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
};

// ======================= Seed =======================
function seed() {
  const countAdmins = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role = ?').get('ROLE_ADMIN').c;
  if (countAdmins === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password_hash, role, active) VALUES (?, ?, ?, 1)')
      .run('admin', hash, 'ROLE_ADMIN');
  }

  const countLevels = db.prepare('SELECT COUNT(*) AS c FROM levels').get().c;
  if (countLevels === 0) {
    const names = ['الأولى متوسط', 'الثانية متوسط', 'الثالثة متوسط', 'الرابعة متوسط', 'الأولى ثانوي', 'الثانية ثانوي', 'الثالثة ثانوي'];
    const ins = db.prepare('INSERT INTO levels (name, sort_order) VALUES (?, ?)');
    names.forEach((n, i) => ins.run(n, i + 1));

    const insClass = db.prepare('INSERT INTO classes (level_id, name, sort_order) VALUES (?, ?, ?)');
    const levels = db.prepare('SELECT id FROM levels ORDER BY sort_order').all();
    levels.forEach(lv => {
      ['رياضيات', 'علوم تجريبية'].forEach((sh, i) => insClass.run(lv.id, sh, i + 1));
    });
  }

  const countSubjects = db.prepare('SELECT COUNT(*) AS c FROM subjects').get().c;
  if (countSubjects === 0) {
    const ins = db.prepare('INSERT INTO subjects (name) VALUES (?)');
    ['الرياضيات', 'الفيزياء', 'العلوم', 'اللغة العربية', 'اللغة الفرنسية', 'اللغة الإنجليزية', 'التاريخ والجغرافيا', 'الإعلام الآلي']
      .forEach(s => ins.run(s));
  }

  const countYears = db.prepare('SELECT COUNT(*) AS c FROM academic_years').get().c;
  if (countYears === 0) {
    db.prepare('INSERT INTO academic_years (name, is_active) VALUES (?, 1)').run('2026/2027');
  }
}

seed();

module.exports = db;