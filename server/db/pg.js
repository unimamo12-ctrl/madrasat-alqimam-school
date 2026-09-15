const fs = require('fs');
const path = require('path');
const { Client, types } = require('pg');

// Return bigint as plain numbers
types.setTypeParser(types.builtins.INT8, v => parseInt(v, 10));
types.setTypeParser(types.builtins.NUMERIC, v => parseFloat(v));

const client = new Client({ connectionString: process.env.DATABASE_URL });
let ready = false;

// ========================= SQL Translation =========================

// الجداول ذات عمود id أساسي (حتى يمكن إرفاق RETURNING id)
const ID_TABLES = new Set(['users','academic_years','levels','classes','subjects','students','teachers','groups','student_group_selections','payments','schedules','announcements']);

function getInsertTable(sql) {
  const m = /^\s*INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(sql);
  return m ? m[1] : null;
}

function translateSql(sql) {
  const hadIgnore = /INSERT\s+OR\s+IGNORE/i.test(sql);
  let s = sql
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO')
    .replace(/datetime\(\s*['"]now['"]\s*\)/gi, "to_char(now(),'YYYY-MM-DD HH24:MI:SS')");

  // ? → $N (skip inside single-quoted strings)
  let n = 0, out = '', inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { out += c; if (c === "'" && s[i + 1] === "'") { out += s[++i]; } else if (c === "'") inStr = false; }
    else if (c === "'") { inStr = true; out += c; } else if (c === '?') { out += '$' + (++n); } else { out += c; }
  }
  s = out.trim().replace(/;\s*$/, '');

  const insTable = getInsertTable(s);
  if (hadIgnore) s += ' ON CONFLICT DO NOTHING';
  if (insTable && ID_TABLES.has(insTable) && !/RETURNING/i.test(s)) s += ' RETURNING id';
  return s + ';';
}

function ensureReturning(sql) {
  const insTable = getInsertTable(sql);
  if (insTable && ID_TABLES.has(insTable) && !/RETURNING/i.test(sql)) return sql.trim().replace(/;\s*$/, '') + ' RETURNING id;';
  return sql;
}

async function getTableColumns(tableName) {
  const r = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [tableName]);
  return r.rows.map(row => row.column_name);
}

// ========================= Query Executor =========================
async function run(sql, ...params) {
  if (sql.includes('?')) sql = translateSql(sql);
  sql = ensureReturning(sql);
  const r = await client.query(sql, params);
  return { changes: r.rowCount || 0, lastInsertRowid: r.rows[0]?.id ?? null, rows: r.rows };
}

// ========================= DB Interface =========================
function prepare(sql) {
  return {
    async get(...p) {
      const r = await run(sql, ...p);
      return r.rows[0] ?? undefined;
    },
    async all(...p) {
      const r = await run(sql, ...p);
      return r.rows;
    },
    async run(...p) {
      const r = await run(sql, ...p);
      return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
    }
  };
}

function transaction(fn) {
  return async (...args) => {
    await client.query('BEGIN');
    try {
      const result = await fn(...args);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  };
}

// ========================= Seed =========================
async function seed() {
  const count = (await client.query("SELECT COUNT(*) AS c FROM users WHERE role='ROLE_ADMIN'")).rows[0].c;
  if (count === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    await client.query("INSERT INTO users (username, password_hash, role, active) VALUES ('admin',$1,'ROLE_ADMIN',1)", [hash]);
  }
  const cl = (await client.query('SELECT COUNT(*) AS c FROM levels')).rows[0].c;
  if (cl === 0) {
    const names = ['الأولى متوسط','الثانية متوسط','الثالثة متوسط','الرابعة متوسط','الأولى ثانوي','الثانية ثانوي','الثالثة ثانوي'];
    for (let i = 0; i < names.length; i++) await client.query('INSERT INTO levels (name, sort_order) VALUES ($1,$2)', [names[i], i + 1]);
    const lvs = (await client.query('SELECT id FROM levels ORDER BY sort_order')).rows;
    for (const lv of lvs) {
      for (let i = 0; i < ['رياضيات','علوم تجريبية'].length; i++) {
        await client.query('INSERT INTO classes (level_id, name, sort_order) VALUES ($1,$2,$3)', [lv.id, ['رياضيات','علوم تجريبية'][i], i + 1]);
      }
    }
  }
  const cs = (await client.query('SELECT COUNT(*) AS c FROM subjects')).rows[0].c;
  if (cs === 0) {
    for (const n of ['الرياضيات','الفيزياء','العلوم','اللغة العربية','اللغة الفرنسية','اللغة الإنجليزية','التاريخ والجغرافيا','الإعلام الآلي'])
      await client.query('INSERT INTO subjects (name) VALUES ($1)', [n]);
  }
  const cy = (await client.query('SELECT COUNT(*) AS c FROM academic_years')).rows[0].c;
  if (cy === 0) await client.query("INSERT INTO academic_years (name, is_active) VALUES ('2026/2027',1)");
}

async function setSequences() {
  for (const tbl of ['users','academic_years','levels','classes','subjects','students','teachers','teacher_levels','teacher_classes','groups','student_group_selections','payments','schedules','announcements']) {
    const seq = (await client.query(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [tbl])).rows[0].seq;
    if (seq) await client.query(`SELECT setval($1, (SELECT COALESCE(MAX(id),1) FROM ${tbl}))`, [seq]);
  }
}

async function init() {
  if (ready) return;
  await client.connect();
  const raw = fs.readFileSync(path.join(__dirname, 'schema.pg.sql'), 'utf8');
  const stmts = raw.split(';').map(s => s.replace(/--[^\n]*/g, '').trim()).filter(Boolean);
  for (const stmt of stmts) await client.query(stmt);
  await seed();
  await setSequences();
  ready = true;
  console.log('✅ PostgreSQL متصل ومتاح.');
}

module.exports = { prepare, transaction, init, setSequences, translateSql };
