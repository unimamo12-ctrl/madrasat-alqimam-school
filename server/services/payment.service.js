"use strict";
// ==================== خدمة الدفع الشهري الديناميكي ====================
// - اشتقاق ديناميكي من تاريخ بداية الحساب لكل تلميذ (لا أعمدة شهر/سنة جديدة)
// - الآن بتوقيت الجزائر (Africa/Algiers)
// - إضافة أشهر تقويمية حقيقية (clamp لطول الشهر الهدف، لا +30 يوماً)
// - حالات الشهر: PAID / UNPAID / NOT_DUE
// - الدوال المطلوبة: getCurrentBillingPeriod, calculateStudentDueDate,
//   getStudentPaymentStatus, getUnpaidStudents, markPaymentAsPaid

const NUM_MONTHS = 9;
const DEFAULT_START_DATE = '2026-09-23';
const DEFAULT_FEE = 3000;
const MONTH_NAMES = ['سبتمبر','أكتوبر','نوفمبر','ديسمبر','جانفي','فيفري','مارس','أفريل','ماي'];

function pad2(n) { return String(n).padStart(2, '0'); }

// YYYY-MM-DD -> {y,mo,d} ; null إن لم يكن صالحاً
function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  return m ? { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) } : null;
}
function toIsoDate({ y, mo, d }) { return `${y}-${pad2(mo)}-${pad2(d)}`; }
function daysInMonth(y, mo) { return new Date(y, mo, 0).getDate(); }

// اليوم بتوقيت الجزائر -> YYYY-MM-DD
function todayAlgiers(now) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now || new Date());
  const g = t => (p.find(x => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function compareISO(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

// إضافة k شهراً تقويمياً حقيقياً مع ضبط اليوم على طول الشهر الهدف
// مثال: 2026-01-31 + شهر = 2026-02-28 (وليس +30 يوماً)
function addMonthsClamped(startIso, k) {
  const p = parseIsoDate(startIso);
  if (!p) throw new Error('تاريخ بداية غير صالح.');
  const kk = Number(k) || 0;
  const total = p.y * 12 + (p.mo - 1) + kk;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(p.d, daysInMonth(ny, nm));
  return toIsoDate({ y: ny, mo: nm, d: nd });
}

// بداية الفترة k = تاريخ البداية + k شهراً
function periodStart(startIso, k) { return addMonthsClamped(startIso, Number(k)); }
// نهاية الفترة k = آخر يوم من شهر الفترة (قبل بداية الفترة k+1)
function periodEnd(startIso, k) {
  const p = parseIsoDate(addMonthsClamped(startIso, Number(k) + 1));
  return toIsoDate({ y: p.y, mo: p.mo, d: 0 });
}

// ==================== الفترة الحالية ====================
// أكبر k بحيث بداية(k) <= اليوم؛ -1 إذا لم تبدأ الاستحقاقات بعد
function currentPeriodIndex(startIso, todayIso) {
  if (compareISO(periodStart(startIso, 0), todayIso) > 0) return -1;
  let k = 0;
  while (k < NUM_MONTHS - 1 && compareISO(periodStart(startIso, k + 1), todayIso) <= 0) k++;
  return k;
}

// حالة شهر k: pay = صف الدفع أو null
function periodStatus(pay, k, curK) {
  if (pay && Number(pay.is_paid) === 1) return 'PAID';
  if (curK < 0 || k > curK) return 'NOT_DUE';
  return 'UNPAID';
}

// اسم الشهر المدرسي k
function monthName(k) { return MONTH_NAMES[Number(k)] || `شهر ${Number(k) + 1}`; }
// السنة الميلادية لفترة k
function periodYear(startIso, k) { return Number(String(periodStart(startIso, k)).slice(0, 4)); }

// ==================== الواجهة الأساسية ====================
// student: { id, status, account_start_date } أو null
// payments: صفوف الدفع الخاصة به ([] إن لم يوجد)
// settings: { default_start_date?, monthly_fee? } اختياري
function buildStudentSchedule(student, payments, settings, todayIso) {
  const start = (student && String(student.account_start_date || '').trim()) || (settings && String(settings.default_start_date || '').trim()) || DEFAULT_START_DATE;
  const fee = (settings && Number(settings.monthly_fee) > 0) ? Number(settings.monthly_fee) : DEFAULT_FEE;
  const today = todayIso || todayAlgiers();
  const payByK = {};
  for (const p of (payments || [])) payByK[Number(p.month_index)] = p;
  const curK = currentPeriodIndex(start, today);
  const rows = [];
  for (let k = 0; k < NUM_MONTHS; k++) {
    const pay = payByK[k] || null;
    const st = periodStatus(pay, k, curK);
    rows.push({
      k, month_index: k,
      month: monthName(k),
      year: periodYear(start, k),
      period_start: periodStart(start, k),
      period_end: periodEnd(start, k),
      status: st,
      is_paid: st === 'PAID' ? 1 : st === 'UNPAID' ? 0 : null,
      payment_date: (st === 'PAID' && pay) ? (pay.payment_date || null) : null
    });
  }
  return {
    rows,
    current_k: curK,
    current_month: curK >= 0 ? `${monthName(curK)} ${periodYear(start, curK)}` : null,
    today, start
  };
}

// ==================== الدوال الخمس المطلوبة ====================
// 1) الفترة المحاسبية الحالية الموحّدة من تاريخ البداية الافتراضي/الموحّد للإعدادات
function getCurrentBillingPeriod(settings, todayIso) {
  const start = (settings && String(settings.default_start_date || '').trim()) || DEFAULT_START_DATE;
  const today = todayIso || todayAlgiers();
  const k = currentPeriodIndex(start, today);
  return {
    k,
    start,
    today,
    month: k >= 0 ? monthName(k) : null,
    year: k >= 0 ? periodYear(start, k) : null,
    label: k >= 0 ? `${monthName(k)} ${periodYear(start, k)}` : null
  };
}

// 2) تاريخ استحقاق شهر k = تاريخ البداية + k شهراً
function calculateStudentDueDate(startIso, k) { return periodStart(startIso, Number(k)); }

// 3) حالة دفع تلميذ عبر الجدولة الكاملة (الاستعلام عنها وليس تخزين رقم)
function getStudentPaymentStatus(student, payments, settings, todayIso) {
  const today = todayIso || todayAlgiers();
  const sched = buildStudentSchedule(student, payments, settings, today);
  const curK = sched.current_k;
  const pay = (payments || []).find(x => Number(x.month_index) === curK) || null;
  return {
    student_id: student ? student.id : null,
    billing_period: sched.current_month,
    status: curK < 0 ? 'NOT_DUE' : periodStatus(pay, curK, curK),
    is_paid: curK >= 0 ? (pay && Number(pay.is_paid) === 1) : null,
    due_date: curK >= 0 ? sched.rows[curK].period_start : null,
    schedule: sched.rows,
    today
  };
}

// 4) عد/سرد غير المسددين = عدّ التلاميذ النشطين غير الحاصلين على دفع للشهر الحالي (ديناميكي)
function getUnpaidStudents(students, paymentsByStudent, settings, todayIso) {
  const today = todayIso || todayAlgiers();
  const list = [];
  let total = 0;
  const fee = (settings && Number(settings.monthly_fee) > 0) ? Number(settings.monthly_fee) : DEFAULT_FEE;
  for (const s of (students || [])) {
    if (Number(s.status) === 0) continue;
    const st = getStudentPaymentStatus(s, paymentsByStudent[s.id] || [], settings, today);
    if (st.status === 'PAID') continue;
    total += Number(fee);
    list.push({ student: s, ...st });
  }
  const billing = getCurrentBillingPeriod(settings, today);
  return { billing_period: billing.label, count: list.length, total, list, today };
}

// 5) تسجيل دفع شهر: يمنع التكرار (student + month_index) عبر UNIQUE في قاعدة البيانات
function markPaymentAsPaid(payment) {
  // السلامة فقط: يجب أن يُفرض UNIQUE(student_id, month_index) في الجدول
  // والتسجيل الفعلي يتم في admin.routes عبر INSERT ... ON CONFLICT
  if (!payment || !payment.student_id || payment.month_index === undefined || payment.month_index === null) {
    throw new Error('بيانات تسجيل الدفع ناقصة.');
  }
  return {
    student_id: Number(payment.student_id),
    month_index: Number(payment.month_index),
    is_paid: 1,
    payment_date: payment.payment_date || todayAlgiers(),
    note: (payment.note !== undefined && payment.note !== null && String(payment.note).trim() !== '')
      ? String(payment.note).trim() : null
  };
}

module.exports = {
  NUM_MONTHS, DEFAULT_START_DATE, DEFAULT_FEE, MONTH_NAMES,
  parseIsoDate, toIsoDate, daysInMonth, todayAlgiers, compareISO,
  addMonthsClamped, periodStart, periodEnd, currentPeriodIndex, periodStatus,
  monthName, periodYear, buildStudentSchedule,
  getCurrentBillingPeriod, calculateStudentDueDate, getStudentPaymentStatus,
  getUnpaidStudents, markPaymentAsPaid
};