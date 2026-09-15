const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'school.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new DatabaseSync(DB_PATH);
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec('PRAGMA busy_timeout = 5000');

// ========================= Schema =========================
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
sqlite.exec(schema);

// phone column migration
const cols = sqlite.prepare('PRAGMA table_info(students)').all().map(c => c.name);
if (!cols.includes('phone')) sqlite.exec('ALTER TABLE students ADD COLUMN phone TEXT');

// ========================= Seed =========================
function seed() {
  const ca = sqlite.prepare('SELECT COUNT(*) AS c FROM users WHERE role = ?').get('ROLE_ADMIN').c;
  if (ca === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    sqlite.prepare('INSERT INTO users (username, password_hash, role, active) VALUES (?, ?, ?, 1)').run('admin', hash, 'ROLE_ADMIN');
  }

  const cl = sqlite.prepare('SELECT COUNT(*) AS c FROM levels').get().c;
  if (cl === 0) {
    const names = ['الأولى متوسط','الثانية متوسط','الثالثة متوسط','الرابعة متوسط','الأولى ثانوي','الثانية ثانوي','الثالثة ثانوي'];
    const ins = sqlite.prepare('INSERT INTO levels (name, sort_order) VALUES (?, ?)');
    names.forEach((n, i) => ins.run(n, i + 1));
    const insC = sqlite.prepare('INSERT INTO classes (level_id, name, sort_order) VALUES (?, ?, ?)');
    const lvs = sqlite.prepare('SELECT id FROM levels ORDER BY sort_order').all();
    lvs.forEach(lv => { ['رياضيات','علوم تجريبية'].forEach((s, i) => insC.run(lv.id, s, i + 1)); });
  }

  const cs = sqlite.prepare('SELECT COUNT(*) AS c FROM subjects').get().c;
  if (cs === 0) {
    const ins = sqlite.prepare('INSERT INTO subjects (name) VALUES (?)');
    ['الرياضيات','الفيزياء','العلوم','اللغة العربية','اللغة الفرنسية','اللغة الإنجليزية','التاريخ والجغرافيا','الإعلام الآلي'].forEach(s => ins.run(s));
  }

  const cy = sqlite.prepare('SELECT COUNT(*) AS c FROM academic_years').get().c;
  if (cy === 0) sqlite.prepare('INSERT INTO academic_years (name, is_active) VALUES (?, 1)').run('2026/2027');
}
seed();

// ========================= Adapter =========================
// Wrap sync node:sqlite in Promises so route code can uniformly use await
function stmt(sql) {
  const s = sqlite.prepare(sql);
  return {
    get(...p) { return Promise.resolve(s.get(...p)); },
    all(...p) { return Promise.resolve(s.all(...p)); },
    run(...p) {
      const r = s.run(...p);
      return Promise.resolve({ changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) });
    }
  };
}

function transaction(fn) {
  return async (...args) => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(...args);
      sqlite.exec('COMMIT');
      return result;
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  };
}

async function init() { /* already done at require time */ }

module.exports = { prepare: stmt, transaction, init };
