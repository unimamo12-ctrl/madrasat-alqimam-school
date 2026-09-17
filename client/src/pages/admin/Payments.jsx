import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
import { Loading, Empty, Modal, Badge } from '../../components/ui';
import { useToast } from '../../components/Toast';

const MONTHS = ['سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر', 'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي'];

export default function AdminPayments() {
  const toast = useToast();
  const [students, setStudents] = useState(null);
  const [filters, setFilters] = useState({ q: '', level_id: '', class_id: '', paid_status: '' });
  const [options, setOptions] = useState({ levels: [], classes: [] });
  const [detail, setDetail] = useState(null);
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([apiGet('/admin/payments', filters), apiGet('/admin/settings/options')]);
      setStudents(s.students);
      setOptions({ levels: o.levels, classes: o.classes });
    } catch (e) { toast.error(e.message); }
  }, [filters, toast]);

  useEffect(() => { load(); }, [load]);

  async function openDetail(st) {
    try {
      const d = await apiGet(`/admin/payments/student/${st.student_id}`);
      setDetail(d);
    } catch (e) { toast.error(e.message); }
  }

  async function recordPayment() {
    if (record.month_index === '' || !record.amount) { toast.error('حدد الشهر وكم دفع التلميذ.'); return; }
    if (Number(record.amount) <= 0 || isNaN(Number(record.amount))) { toast.error('كم دفع التلميذ يجب أن يكون مبلغاً أكبر من 0.'); return; }
    setBusy(true);
    try {
      await apiPost(`/admin/payments/student/${detail.student.id}`, { month_index: Number(record.month_index), amount: Number(record.amount) });
      toast.success('تم تسجيل الدفع بنجاح.');
      setRecord(null);
      openDetail({ student_id: detail.student.id });
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function cancelPayment(p) {
    setBusy(true);
    try {
      await apiDelete(`/admin/payments/${p.payment_id}`);
      toast.success('تم إلغاء الدفع.');
      openDetail({ student_id: detail.student.id });
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function editAmount(p, amount) {
    try {
      await apiPut(`/admin/payments/${p.payment_id}`, { amount: Number(amount), is_paid: 1 });
      toast.success('تم تعديل كم دفع التلميذ.');
      openDetail({ student_id: detail.student.id });
    } catch (e) { toast.error(e.message); }
  }

  const showAmount = a => (a === null || a === undefined || a === '' ? '—' : `${a} دج`);

  return (
    <div>
      <div className="page-header">
        <h1>إدارة الدفع الشهري</h1>
        <p className="sub">تسجيل وتعديل وإلغاء دفعات التلاميذ (سبتمبر — ماي)</p>
      </div>

      <div className="filterbar">
        <div className="search-box">
          <span className="sico">🔍</span>
          <input className="input" placeholder="بحث باسم أو رقم تسجيل التلميذ..." value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <select className="select" value={filters.level_id} onChange={e => setFilters({ ...filters, level_id: e.target.value })}>
          <option value="">كل المستويات</option>
          {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="select" value={filters.class_id} onChange={e => setFilters({ ...filters, class_id: e.target.value })}>
          <option value="">كل الشعب</option>
          {options.classes.filter(c => String(c.level_id) === String(filters.level_id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select" value={filters.paid_status} onChange={e => setFilters({ ...filters, paid_status: e.target.value })}>
          <option value="">كل الحالات</option>
          <option value="paid">مسدد</option>
          <option value="unpaid">غير مسدد</option>
        </select>
      </div>

      {students === null ? <Loading /> : students.length === 0 ? (
        <Empty icon="💳" title="لا يوجد تلاميذ مطابقون" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>التلميذ</th><th>رقم التسجيل</th><th>المستوى</th><th>الشعبة</th><th>الأشهر المسداة</th><th>الحالة</th><th></th></tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.student_id}>
                  <td style={{ fontWeight: 800 }}>{s.first_name} {s.last_name}</td>
                  <td className="mono">{s.reg_number}</td>
                  <td>{s.level_name}</td>
                  <td>{s.class_name || '—'}</td>
                  <td>{s.paid_months}/{s.total_months}</td>
                  <td>
                    {s.fully_paid ? <Badge kind="green">مسدد بالكامل</Badge>
                      : s.paid_months > 0 ? <Badge kind="gold">مسدد جزئياً</Badge>
                      : <Badge kind="red">غير مسدد</Badge>}
                  </td>
                  <td><button className="btn btn-primary btn-sm" onClick={() => openDetail(s)}>فتح الملف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `متابعة دفع: ${detail.student.first_name} ${detail.student.last_name}` : ''} wide>
        {detail && (
          <>
            <div className="info-list mb-18">
              <div className="info-item"><div className="k">الاسم الكامل</div><div className="v">{detail.student.first_name} {detail.student.last_name}</div></div>
              <div className="info-item"><div className="k">رقم التسجيل</div><div className="v mono" dir="ltr">{detail.student.reg_number}</div></div>
              <div className="info-item"><div className="k">المستوى</div><div className="v">{detail.student.level_name}</div></div>
              <div className="info-item"><div className="k">الشعبة</div><div className="v">{detail.student.class_name || '—'}</div></div>
            </div>

            <div className="filterbar">
              <button className="btn btn-primary btn-sm" onClick={() => setRecord({ month_index: '', amount: '' })}>
                + تسجيل دفع
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>الشهر</th><th>كم دفع التلميذ</th><th>الحالة</th><th>إجراء</th></tr>
                </thead>
                <tbody>
                  {detail.payments.map(p => (
                    <tr key={p.month_index}>
                      <td style={{ fontWeight: 800 }}>{p.month}</td>
                      <td className="mono" dir="ltr">{p.is_paid ? showAmount(p.amount) : '—'}</td>
                      <td>{p.is_paid ? <Badge kind="green">تم الدفع</Badge> : <Badge kind="red">لم يتم الدفع</Badge>}</td>
                      <td>
                        <div className="table-actions">
                          {p.is_paid ? (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => { const d = prompt('تعديل كم دفع التلميذ:', p.amount); if (d && d.trim()) editAmount(p, d.trim()); }}>تعديل</button>
                              <button className="btn btn-danger btn-sm" onClick={() => cancelPayment(p)}>إلغاء الدفع</button>
                            </>
                          ) : (
                            <button className="btn btn-accent btn-sm" onClick={() => setRecord({ month_index: p.month_index, amount: '' })}>تسجيل الدفع</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!record} onClose={() => setRecord(null)} title="تسجيل الدفع"
        footer={<>
          <button className="btn btn-primary" onClick={recordPayment} disabled={busy}>{busy ? '...' : 'تأكيد الدفع'}</button>
          <button className="btn btn-ghost" onClick={() => setRecord(null)}>إلغاء</button>
        </>}>
        <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>الشهر</label>
            <select className="select" value={record?.month_index} onChange={e => setRecord({ ...record, month_index: e.target.value })}>
              <option value="">اختر الشهر...</option>
              {MONTHS.map((m, i) => (
                <option key={i} value={i}>{m}{detail?.payments[i]?.is_paid ? ' (مسدد)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>كم دفع التلميذ (دج)</label>
            <input className="input mono" dir="ltr" type="number" min="1" step="0.01" value={record?.amount ?? ''} onChange={e => setRecord({ ...record, amount: e.target.value })} placeholder="مثال: 3000" />
          </div>
        </div>
      </Modal>
    </div>
  );
}