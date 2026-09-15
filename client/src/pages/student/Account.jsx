import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import StudentLayout from '../../components/StudentLayout';
import { Loading, Empty, ErrorState, Badge } from '../../components/ui';
import { useToast } from '../../components/Toast';

const MONTHS = ['سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر', 'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي'];

export default function StudentAccount() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    apiGet('/student/account')
      .then(data => setState({ loading: false, error: null, data }))
      .catch(err => setState(s => ({ ...s, loading: false, error: err.message })));
  }, []);

  if (state.loading) return <StudentLayout> <div className="page"><Loading /></div> </StudentLayout>;
  if (state.error) return <StudentLayout> <div className="page"><ErrorState message={state.error} /></div> </StudentLayout>;

  const { student, selections, payments } = state.data;

  // تحديد الشهر الحالي (للتلوين: سبتمبر=0 ... ماي=8) — الحالي = شهر السنة الدراسية
  const now = new Date().getMonth(); // 0=جانفي..11=ديسمبر
  const schoolMonth = (now + 4) % 12; // school-month index among 0..11

  return (
    <StudentLayout>
      <div className="page">
        <div className="container">
          <div className="page-header">
            <h1>حسابي</h1>
            <p className="sub">معلوماتك الشخصية واختياراتك وحالة الدفع</p>
          </div>

          <div className="card" style={{ padding: 22, marginBottom: 20 }}>
            <h3 className="mb-12">المعلومات الشخصية</h3>
            <div className="info-list">
              <div className="info-item"><div className="k">الاسم</div><div className="v">{student.first_name}</div></div>
              <div className="info-item"><div className="k">اللقب</div><div className="v">{student.last_name}</div></div>
              <div className="info-item"><div className="k">رقم التسجيل</div><div className="v mono" style={{ direction: 'ltr' }}>{student.reg_number}</div></div>
              {student.phone && <div className="info-item"><div className="k">الهاتف</div><div className="v mono" style={{ direction: 'ltr' }}>{student.phone}</div></div>}
              <div className="info-item"><div className="k">السنة الدراسية</div><div className="v">{student.academic_year_name}</div></div>
              <div className="info-item"><div className="k">المستوى</div><div className="v">{student.level_name}</div></div>
              <div className="info-item"><div className="k">الشعبة</div><div className="v">{student.class_name || '—'}</div></div>
            </div>
          </div>

          <div className="card" style={{ padding: 22, marginBottom: 20 }}>
            <h3 className="mb-12">الأساتذة الذين تم اختيارهم</h3>
            {selections.length === 0 ? (
              <Empty icon="🗂️" title="لم تختر أي فوج بعد" hint="اذهب إلى الصفحة الرئيسية واختر أفواجك." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>الأستاذ</th><th>المادة</th><th>الفوج</th><th>اليوم</th><th>الوقت</th><th>الحالة</th></tr>
                  </thead>
                  <tbody>
                    {selections.map((s, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 800 }}>{s.tfirst} {s.tlast}</td>
                        <td>{s.subject_name}</td>
                        <td>{s.group_name}</td>
                        <td>{s.day}</td>
                        <td>{s.start_time} - {s.end_time}</td>
                        <td><Badge kind="green">{s.status === 'confirmed' ? 'مؤكد' : s.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {selections.length > 0 && (
              <button className="btn btn-ghost btn-sm mt-12" onClick={() => toast.warn('لتغيير الفوج، يرجى التواصل مع الإدارة.')}>
                تغيير الفوج
              </button>
            )}
          </div>

          <div className="card" style={{ padding: 22 }}>
            <h3 className="mb-8">متابعة الدفع</h3>
            <p className="small text-muted mb-18" style={{ fontWeight: 600 }}>
              جدول الدفع الشهري من سبتمبر إلى ماي — الدفع يسجله الإدارة فقط، وأنت ترى الحالة.
            </p>
            <div className="pay-grid">
              {payments.map((p, i) => {
                const nowIdx = schoolMonth;
                const isCurrent = i <= nowIdx;
                let cls = 'unpaid';
                if (p.is_paid) cls = 'paid';
                else if (isCurrent) cls = 'late';
                return (
                  <div key={i} className={`pay-cell ${cls}`}>
                    <div className="m">{MONTHS[i]}</div>
                    {p.is_paid ? (
                      <>
                        <div className="st">تم الدفع ✓</div>
                        {p.payment_date && <div className="dt">{p.payment_date}</div>}
                      </>
                    ) : (
                      <>
                        <div className="st">لم يتم الدفع</div>
                        <div className="dt">{i <= nowIdx ? 'متأخر' : 'قادم'}</div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}