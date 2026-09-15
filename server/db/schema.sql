PRAGMA foreign_keys = ON;

-- ============================================================
-- مدرسة القمم النجاح - مخطط قاعدة البيانات
-- ============================================================

-- المستخدمون (يوحّد الطلاب والإدارة لأغراض المصادقة)
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('ROLE_STUDENT', 'ROLE_ADMIN')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- السنة الدراسية
CREATE TABLE IF NOT EXISTS academic_years (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- المستويات
CREATE TABLE IF NOT EXISTS levels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL
);

-- الشعب (مرتبطة بمستوى)
CREATE TABLE IF NOT EXISTS classes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  level_id   INTEGER NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(level_id, name)
);

-- المواد
CREATE TABLE IF NOT EXISTS subjects (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

-- التلاميذ
CREATE TABLE IF NOT EXISTS students (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  reg_number        TEXT NOT NULL UNIQUE,
  phone             TEXT,
  level_id          INTEGER NOT NULL REFERENCES levels(id),
  class_id          INTEGER REFERENCES classes(id),
  academic_year_id  INTEGER REFERENCES academic_years(id),
  status            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- الأساتذة
CREATE TABLE IF NOT EXISTS teachers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  photo      TEXT,
  status     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- المستويات التي يدرسها الأستاذ
CREATE TABLE IF NOT EXISTS teacher_levels (
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  level_id   INTEGER NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, level_id)
);

-- الشعب التي يدرسها الأستاذ
CREATE TABLE IF NOT EXISTS teacher_classes (
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, class_id)
);

-- الأفواج
CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id  INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id  INTEGER NOT NULL REFERENCES subjects(id),
  level_id    INTEGER NOT NULL REFERENCES levels(id),
  class_id    INTEGER REFERENCES classes(id),
  name        TEXT NOT NULL,
  day         TEXT NOT NULL,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  capacity    INTEGER NOT NULL CHECK (capacity > 0),
  status      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- اختيارات التلاميذ للأفواج
-- قيد UNIQUE(student_id, teacher_id) يمنع اختيار أكثر من فوج لنفس الأستاذ
CREATE TABLE IF NOT EXISTS student_group_selections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_selections_group ON student_group_selections(group_id);
CREATE INDEX IF NOT EXISTS idx_selections_student ON student_group_selections(student_id);

-- الدفعات الشهرية (0=سبتمبر ... 8=ماي)
CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  month_index  INTEGER NOT NULL CHECK (month_index BETWEEN 0 AND 8),
  payment_date TEXT,
  is_paid      INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  created_by   INTEGER REFERENCES users(id),
  updated_at   TEXT,
  UNIQUE (student_id, month_index)
);

-- الجدول الدراسي (يعكس بيانات الأفواج)
CREATE TABLE IF NOT EXISTS schedules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   INTEGER NOT NULL UNIQUE REFERENCES groups(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time   TEXT NOT NULL
);

-- الإعلانات
CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message    TEXT NOT NULL DEFAULT '',
  images     TEXT NOT NULL DEFAULT '[]',
  status     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);