#!/usr/bin/env node
/**
 * ترحيل آمن من SQLite إلى PostgreSQL
 *
 * الاستخدام:
 *   DATABASE_URL="postgres://..." node scripts/migrate-sqlite-to-pg.js [--force] [--dry-run]
 *
 * السلوكيات:
 * - ي他知道 نسخة احتياطية أولاً (backup-sqlite.js)
 * - ينشئ الجداول في PostgreSQL إذا لم تكن موجودة
 * - ينقل جميع البيانات مع الحفاظ على الـ IDs والعلاقات
 * - ON CONFLICT DO NOTHING (يمنع التكرار عند التشغيل المكرر)
 * - إذا CLOUDINARY_URL موجود، يرفع الصور إلى السحابة
 * - لا يحذف أي شيء
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { Client, types } = require('pg');

types.setTypeParser(types.builtins.INT8, v => parseInt(v, 10));
types.setTypeParser(types.builtins.NUMERIC, v => parseFloat(v));

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'school.db');

// ========================= Cloudinary (optional) =========================
let cloudName = null;
let cloudinaryV2 = null;
async function setupCloudinary() {
  const url = process.env.CLOUDINARY_URL;
  if (!url) return;
  try {
    cloudinaryV2 = require('cloudinary').v2;
    cloudinaryV2.config({ secure: true });
    const match = url.match(/@([^/]+)/);
    cloudName = match ? match[1] : null;
    if (cloudName) console.log('☁️  Cloudinary مُعد:', cloudName);
  } catch (e) {
    console.warn('⚠️  تعذر تحميل cloudinary:', e.message);
  }
}

async function uploadImage(localPath, publicId) {
  if (!cloudinaryV2 || !fs.existsSync(localPath)) return null;
  try {
    const buffer = fs.readFileSync(localPath);
    const result = await new Promise((resolve, reject) => {
      cloudinaryV2.uploader.upload_stream(
        { resource_type: 'image', folder: 'school', public_id, overwrite: true,
          transformation: [{ quality: 'auto' }, { fetch_format: 'auto' }] },
        (err, r) => err ? reject(err) : resolve(r)
      ).end(buffer);
    });
    return `/uploads/${publicId}`;
  } catch (e) {
    console.warn(`⚠️  فشل رفع ${localPath}:`, e.message);
    return null;
  }
}

// ========================= Data Reading =========================
function readSQLiteTable(sqlite, tableName) {
  return sqlite.prepare(`SELECT * FROM "${tableName}"`).all();
}

// ========================= Migration Rules =========================
// ترتيب الإدخال حسب الاعتماديات (Foreign Keys)
const MIGRATION_ORDER = [
  'academic_years',
  'users',            // first: seed admin already exists but ON CONFLICT skips
  'levels',
  'classes',
  'subjects',
  'students',
  'teachers',
  'teacher_levels',
  'teacher_classes',
  'groups',
  'student_group_selections',
  'payments',
  'schedules',
  'announcements'
];

// أعمدة كل جدول (نحتفظ بالجميع بما فيها id)
const TABLE_COLUMNS = {
  academic_years: ['id', 'name', 'is_active'],
  users: ['id', 'username', 'password_hash', 'role', 'active', 'created_at'],
  levels: ['id', 'name', 'sort_order'],
  classes: ['id', 'level_id', 'name', 'sort_order'],
  subjects: ['id', 'name'],
  students: ['id', 'user_id', 'first_name', 'last_name', 'reg_number', 'phone', 'level_id', 'class_id', 'academic_year_id', 'status', 'created_at'],
  teachers: ['id', 'first_name', 'last_name', 'subject_id', 'photo', 'status', 'created_at'],
  teacher_levels: ['teacher_id', 'level_id'],
  teacher_classes: ['teacher_id', 'class_id'],
  groups: ['id', 'teacher_id', 'subject_id', 'level_id', 'class_id', 'name', 'day', 'start_time', 'end_time', 'capacity', 'status', 'created_at'],
  student_group_selections: ['id', 'student_id', 'group_id', 'teacher_id', 'status', 'created_at'],
  payments: ['id', 'student_id', 'month_index', 'payment_date', 'is_paid', 'note', 'created_by', 'updated_at'],
  schedules: ['id', 'group_id', 'day', 'start_time', 'end_time'],
  announcements: ['id', 'message', 'images', 'status', 'created_at', 'updated_at']
};

// ON CONFLICT targets (defaults to id if not specified)
const CONFLICT_TARGETS = {
  teacher_levels: '(teacher_id, level_id)',
  teacher_classes: '(teacher_id, class_id)',
  student_group_selections: '(student_id, teacher_id)',
  payments: '(student_id, month_index)',
};

function buildInsert(tableName, columns) {
  const cols = columns.map(c => `"${c}"`).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const conflict = CONFLICT_TARGETS[tableName] ? `ON CONFLICT ${CONFLICT_TARGETS[tableName]} DO NOTHING` : 'ON CONFLICT (id) DO NOTHING';
  return `INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders}) ${conflict}`;
}

// ========================= Image Path Handling =========================
const uploadsDir = path.join(__dirname, '..', 'uploads');

async function processTeacherPhoto(photo) {
  if (!photo || !photo.startsWith('/uploads/')) return photo;
  const name = path.basename(photo, path.extname(photo));
  const localFile = path.join(uploadsDir, name + path.extname(photo));
  if (cloudinaryV2 && fs.existsSync(localFile)) {
    const newUrl = await uploadImage(localFile, `school/${name}`);
    if (newUrl) return newUrl;
  }
  return photo; // keep original path
}

async function processAnnouncementImages(imagesJson) {
  if (!imagesJson || imagesJson === '[]') return imagesJson;
  const images = JSON.parse(imagesJson);
  if (!Array.isArray(images) || !images.length) return imagesJson;
  const processed = [];
  for (const img of images) {
    if (img.startsWith('/uploads/')) {
      const name = path.basename(img, path.extname(img));
      const localFile = path.join(uploadsDir, name + path.extname(img));
      if (cloudinaryV2 && fs.existsSync(localFile)) {
        const newUrl = await uploadImage(localFile, `school/${name}`);
        if (newUrl) { processed.push(newUrl); continue; }
      }
    }
    processed.push(img);
  }
  return JSON.stringify(processed);
}

// ========================= Main =========================
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ يرجى تحديد DATABASE_URL في ملف .env أو في المتغيرات البيئية');
    process.exit(1);
  }

  if (!fs.existsSync(SQLITE_PATH)) {
    console.error('❌ ملف SQLite غير موجود:', SQLITE_PATH);
    process.exit(1);
  }

  console.log('📋 معلومات الترحيل:');
  console.log('   SQLite:', SQLITE_PATH);
  console.log('   PostgreSQL:', process.env.DATABASE_URL.replace(/:[^@]+@/, ':***@'));
  console.log('   الوضع:', dryRun ? 'اختبار فقط (لا تغييرات)' : (force ? 'فرض (بدون أسئلة)' : 'عادي'));
  console.log('');

  await setupCloudinary();

  // 1. نسخة احتياطية
  if (!dryRun) {
    console.log('📦 إنشاء نسخة احتياطية...');
    try {
      const { execSync } = require('child_process');
      execSync(`node "${path.join(__dirname, 'backup-sqlite.js')}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    } catch (e) {
      console.error('❌ فشل النسخ الاحتياطي:', e.message);
      process.exit(1);
    }
  }

  // 2. فتح SQLite
  const sqlite = new DatabaseSync(SQLITE_PATH);
  console.log('📂 فتح قاعدة SQLite');

  // 3. قراءة جميع البيانات
  const allData = {};
  let totalRows = 0;
  for (const table of MIGRATION_ORDER) {
    allData[table] = readSQLiteTable(sqlite, table);
    totalRows += allData[table].length;
  }
  console.log(`📊 إجمالي الصفوف للترحيل: ${totalRows}`);
  for (const [t, rows] of Object.entries(allData)) {
    if (rows.length > 0) console.log(`   ${t}: ${rows.length}`);
  }

  if (dryRun) {
    console.log('\n🔍 وضع الاختبار — لا تغييرات.');
    sqlite.close();
    return;
  }

  if (!force && totalRows === 0) {
    console.log('\n✅ لا توجد بيانات للترحيل.');
    sqlite.close();
    return;
  }

  // 4. الاتصال بـ PostgreSQL
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('✅ اتصال PostgreSQL ناجح');

  // 5. إنشاء المخطط
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.pg.sql');
  const rawSchema = fs.readFileSync(schemaPath, 'utf8');
  const stmts = rawSchema.split(';').map(s => s.replace(/--[^\n]*/g, '').trim()).filter(Boolean);
  for (const stmt of stmts) await client.query(stmt);
  console.log('✅ المخطط جاهز');

  // 6. الترحيل داخل معاملة
  console.log('\n🔄 بدء الترحيل...');
  await client.query('BEGIN');

  let inserted = 0;
  let skipped = 0;
  const errors = [];

  try {
    for (const table of MIGRATION_ORDER) {
      const rows = allData[table];
      if (!rows.length) continue;

      const cols = TABLE_COLUMNS[table];
      const sql = buildInsert(table, cols);

      for (const row of rows) {
        const values = [];

        for (const col of cols) {
          let val = row[col];

          // معالجة خاصة بالصور
          if (table === 'teachers' && col === 'photo' && val) {
            val = await processTeacherPhoto(val);
          }
          if (table === 'announcements' && col === 'images') {
            val = await processAnnouncementImages(val);
          }

          values.push(val);
        }

        try {
          const r = await client.query(sql, values);
          if (r.rowCount > 0) inserted++;
          else skipped++;
        } catch (e) {
          errors.push({ table, rowId: row.id, error: e.message });
          console.warn(`   ⚠️  ${table} id=${row.id}: ${e.message.split('\n')[0]}`);
        }
      }
      console.log(`   ✅ ${table}: ${rows.length} صفوف`);
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\n❌ فشل الترحيل، تم التراجع عن جميع التغييرات:', e.message);
    sqlite.close();
    await client.end();
    process.exit(1);
  }

  sqlite.close();

  // 7. تحديث التسلسلات (للجداول التي لديها عمود id فعلياً فقط)
  const idTables = new Set(
    (await client.query(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='id'`))
      .rows.map(r => r.table_name)
  );
  for (const tbl of MIGRATION_ORDER) {
    if (!idTables.has(tbl)) continue;
    try {
      const seq = (await client.query(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [tbl])).rows[0].seq;
      if (seq) await client.query(`SELECT setval($1, (SELECT COALESCE(MAX(id),1) FROM ${tbl}))`, [seq]);
    } catch (e) { /* some tables don't have serial sequences */ }
  }

  // 8. التحقق النهائي
  console.log('\n📊 إحصائيات PostgreSQL بعد الترحيل:');
  for (const table of MIGRATION_ORDER) {
    const r = await client.query(`SELECT COUNT(*) AS c FROM "${table}"`);
    const c = Number(r.rows[0].c);
    if (c > 0) console.log(`   ${table}: ${c}`);
  }

  console.log(`\n✅ اكتمل الترحيل:`);
  console.log(`   صفوف مُدخّلة: ${inserted}`);
  console.log(`   صفوف مُتجاوزة (موجودة مسبقاً): ${skipped}`);
  if (errors.length) console.log(`   أخطاء: ${errors.length} (راجع الأعلى)`);

  await client.end();
}

main().catch(err => {
  console.error('\n❌ خطأ غير متوقع:', err.message);
  process.exit(1);
});
