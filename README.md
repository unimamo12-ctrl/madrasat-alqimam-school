# مدرسة القمم النجاح — نظام إدارة المدرسة

نظام ويب متكامل (Full-Stack) لإدارة التلاميذ والأساتذة والأفواج والجدول الدراسي والدفع الشهري، بواجهة عربية RTL حديثة ومتجاوبة.

## التقنيات

| الطبقة | التقنية |
|---|---|
| Backend API | Node.js + Express |
| قاعدة البيانات | SQLite (`better-sqlite3`) محلياً، أو PostgreSQL عند ضبط `DATABASE_URL` (تبديل تلقائي دون تغيير أي كود) |
| المصادقة والصلاحيات | JWT + Middleware (ROLE_ADMIN / ROLE_STUDENT) |
| الواجهة | React 18 + Vite + React Router |
| الصور | Multer (رفع صور الأساتذة) → محلياً في `server/uploads/` أو Cloudinary عند ضبط البيانات |
| كلمات المرور | bcryptjs |

## التشغيل

```bash
# 1) تثبيت كل التبعيات (مرة واحدة)
npm run install:all

# 2) وضع التطوير: خادم API على 5000 + واجهة على 5173
npm run dev
# → افتح http://localhost:5173

# 3) وضع الإنتاج: بناء الواجهة ثم الخادم يخدم كل شيء على 5000
npm run build
npm start
# → افتح http://localhost:5000
```

### حساب الإدارة الافتراضي
- اسم المستخدم: `admin`
- كلمة المرور: `admin123` (غيّرها من الإعدادات فوراً)

## ملاحظات الأمان والصلاحيات (مهمة)
- التلميذ لا يرى أي شيء قبل تسجيل الدخول: كل الصفحات محمية في الواجهة *و* الخادم (401/403 على مستوى API).
- التلميذ يدخل بـ: **الاسم + اللقب + رقم تسجيل** كما في البطاقة المدرسية (تطابق تام مع قاعدة البيانات).
- حساب التلميذ يُنشئه الإدارة فقط. لا توجد أي صفحة إنشاء حساب ذاتي.
- اختيار الفوج: قيد `UNIQUE(student_id, teacher_id)` في قاعدة البيانات + تحقق داخل `BEGIN IMMEDIATE` transaction يمنع:
  - اختيار أكثر من فوج لنفس الأستاذ.
  - التسجيل في فوج ممتلئ (حتى عند محاولة تلميذين آخر مقعد في نفس اللحظة).
  - التغيير بعد التأكيد (BBackend يرفض أي محاولة من التلميذ).
- الإدارة فقط تستطيع: نقل تلميذ، حذف/إعادة فتح الاختيار، تسجيل/تعديل/إلغاء الدفع، تعديل أي بيانات.
- التلميذ يحاول إرسال Request يدوي بـ `group_id` أو `payment_status` → الـ Backend يرفض (لا توجد نقاط نهاية للطالب لتعديلها أصلاً).

## البنية

```
server/
  index.js                 إدخال الخادم
  db/schema.sql            مخطط SQLite والقيود
  db/schema.pg.sql         مخطط PostgreSQL (يُنشأ تلقائياً عند التهيئة)
  db/database.js           المصدر: يختار PostgreSQL أو SQLite حسب DATABASE_URL
  db/sqlite.js             محرك SQLite (يُحوّل الاستعلامات إلى async)
  db/pg.js                 محرك PostgreSQL + مترجم يعيد كتابة SQLite→PostgreSQL
  lib/cloudinary.js        رفع/حذف/تحسين الصور عبر Cloudinary
  middleware/auth.js       JWT + requireRole
  middleware/upload.js     Multer (ذاكرة) + توجيه الصور سحاباً أو قرصاً
  routes/auth.routes.js    تسجيل دخول الطالب والإدارة
  routes/student.routes.js API التلميذ (محمي بالكامل)
  routes/admin.routes.js   لوحة الإدارة (CRUD كامل)
  scripts/
    backup-sqlite.js           نسخة احتياطية من SQLite (VACUUM INTO)
    migrate-sqlite-to-pg.js    ترحيل آمن SQLite → PostgreSQL (انسخ فقط، لا حذف)
    pg-smoke.js                فحص اتصال PostgreSQL
client/
  src/pages/               صفحات التلميذ ولوحة الإدارة
  src/components/          مكونات قابلة لإعادة الاستخدام
  src/lib/                 api.js + auth.jsx
```

## متغيرات البيئة

انسخ `server/.env.example` إلى `server/.env` وعدّلها حسب الحاجة:

| المتغير | الغرض |
|---|---|
| `JWT_SECRET` | مهم ( إلزامي في الإنتاج ) توقيع التوكنات |
| `DATABASE_URL` | اتركه فارغاً = SQLite محلي. ضعه = اتصال PostgreSQL للتبديل للسحابة |
| `CLOUDINARY_URL` | اختياري، لرفع صور الأساتذة إلى Cloudinary بدلاً من القرص |

ملاحظة: قيمة Cloudinary تجدها في لوحة تحكم Cloudinary تحت **Dashboard → API Environment variable** بصيغة `cloudinary://key:secret@cloudname`.

## النشر على Render + Supabase + Cloudinary

### 1) قاعدة البيانات (Supabase → PostgreSQL)
1. أنشئ مشروعاً جديداً في [Supabase](https://supabase.com).
2. افتح **Project Settings → Database → Connection string** وانسخ رابط `URI` (يبدأ بـ `postgresql://...`).
3. احفظه كي تستخدمه في خطوة Render.

### 2) الصور (Cloudinary)
1. أنشئ حساباً مجانياً في [Cloudinary](https://cloudinary.com).
2. من لوحة التحكم انسخ: **Cloud name** و **API Key** و **API Secret**.
3. (اختياري) ارفع صور الأساتذة الحالية من `server/uploads/` إلى Cloudinary يدوياً، أو اتركه يعمل محلياً بدون إعداد.

### 3) الاستضافة (Render)
1. ارفع المشروع إلى مستودع Git (GitHub/GitLab) ثم في Render أنشئ خدمة **Web Service** مرتبطة بالمستودع.
2. إعدادات الخدمة:
   - **Build Command**: `npm run install:all && npm run build`
   - **Start Command**: `npm start`
   - **Python version**: أي إصدار حديث (افتراضية كافية).
3. أضف متغيرات البيئة في Render (انظر الجدول أعلاه):
   - `JWT_SECRET=` قيمة عشوائية طويلة
   - `DATABASE_URL=` رابط Supabase (URI)
   - `CLOUDINARY_URL=` متغير Cloudinary البيئي (API Environment variable)
4. أنشئ الخدمة. سيبدأ الخادم، وينشئ مخطط PostgreSQL تلقائياً (جداول فارغة).

### 4) نقل البيانات (مرة واحدة، بعد إنشاء الخدمة)
> ⚠️ لا تفعل هذا قبل أن تكون متأكداً — الأمر **ينسخ فقط ولا يحذف** أي شيء من SQLite.

```bash
# محلياً، من مجلد server (يُنشئ نسخة احتياطية أولاً تلقائياً):
npm run backup              # → server/backups/school-<timestamp>.db
npm run migrate:pg:dry      # محاكاة دون كتابة (تحقق من البيانات)
npm run migrate:pg          # التنفيذ الفعلي
npm run pg:smoke            # فحص: الاتصال + عدد الجداول والصفوف
```

- لا حاجة لأوامر SQL يدوية. السكربت ينسخ كل الجداول محافظاً على العلاقات والمعرّفات.
- إذا كان `CLOUDINARY_*` مضبوطاً، يُرفع صور الأساتذة الموجودة إلى Cloudinary تلقائياً ويخزّن المسارات الجديدة.

## إضافة ميزات مستقبلاً
- أضف جدولاً جديداً في `schema.sql` (و`schema.pg.sql`) ثم نقطة API في `routes/` وصفحة في `client/src/pages/`.
- النظام مقسّم (Database / API / Frontend) فلا حاجة لإعادة بناء النظام.