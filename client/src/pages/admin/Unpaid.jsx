import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import { Loading, Empty, Modal, Badge } from '../../components/ui';
import { useToast } from '../../components/Toast';

// كل الدورات التي مرّ تاريخها ولم يدفعها التلميذ (الأقدم ← الأحدث)
function UnpaidMonths({ months }) {
  if (!months || months.length === 0) return <span className="text-muted">—</span>;
  return (
    <div className="unpaid-months">
      <span className="unpaid-count">
        {months.length === 1 ? 'شهر غير مدفوع' : months.length === 2 ? 'شهران غير مدفوعين' : `${months.length} أشهر غير مدفوعة`}
      </span>
      <div className="month-tags">
        {months.map(m => <span key={m.cycle_id} className="month-tag">{m.label}</span>)}
      </div>
    </div>
  );
}

// قائمة عرض فقط (بدون تسجيل دفع) — التسجيل يتم من صفحة "الدفع"
export default function AdminUnpaid() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, data: null, cycle: null });
  const [filters, setFilters] = useState({ q: '', level_id: '', class_id: '' });
  const [options, setOptions] = useState({ levels: [], classes: [] });
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [studentHistory, setStudentHistory] = useState(null);

  // الترتيب يأتي من الخادم حسب رقم التسجيل — لا إعادة ترتيب في الواجهة
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const data = await apiGet('/admin/unpaid', { ...filters, page, per_page: perPage });
      setState({
        loading: false, error: null, data: data.rows, cycle: data.cycle, today: data.today,
        total: data.total, pages: data.pages, win: data.window,
        paid_total: data.paid_total ?? data.cycle?.paid ?? 0,
        unpaid_total: data.unpaid_total ?? data.cycle?.unpaid ?? 0
      });
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e.message }));
    }
  }, [filters, page, perPage]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiGet('/admin/settings/options')
      .then(o => setOptions({ levels: o.levels, classes: o.classes }))
      .catch(() => { });
  }, []);

  async function openHistory(stu) {
    try {
      setStudentHistory(await apiGet(`/admin/students/${stu.student_id}/payment-history`));
    } catch (e) { toast.error(e.message); }
  }

  if (state.loading && !state.data) return <Loading />;
  if (state.error) return <div className="state-box"><div className="big">⚠️</div><div className="title">{state.error}</div></div>;

  const rows = state.data || [];
  const cycle = state.cycle;

  return (
    <div>
      <div className="page-header">
        <h1>الذين لم يدفعوا</h1>
        <p className="sub">
          {cycle ? <>دورة <strong>{cycle.label}</strong> — <span className="mono">{cycle.start_date} ← {cycle.end_date}</span> · الترتيب حسب رقم التسجيل · تسجيل الدفع من صفحة «الدفع»</> : 'لا توجد دورة حالية'}
        </p>
      </div>
      {cycle && (
        <div className="stat-grid mb-18">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#fee2e2' }}>⛔</div>
            <div><div className="num">{state.unpaid_total}</div><div className="lbl">غير مسدد</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#dcfce7' }}>✅</div>
            <div><div className="num">{state.paid_total}</div><div className="lbl">مسدد</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#eff6ff' }}>👥</div>
            <div><div className="num">{state.total}</div><div className="lbl">إجمالي التلاميذ</div></div>
          </div>
        </div>
      )}

      <div className="filterbar">
        <div className="search-box">
          <span className="sico">🔍</span>
          <input
            className="input"
            placeholder="بحث بالاسم أو رقم التسجيل..."
            value={filters.q}
            onChange={e => { setPage(1); setFilters({ ...filters, q: e.target.value }); }}
          />
        </div>
        <select className="select" value={filters.level_id} onChange={e => { setPage(1); setFilters({ ...filters, level_id: e.target.value, class_id: '' }); }}>
          <option value="">كل المستويات</option>
          {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="select" value={filters.class_id} onChange={e => { setPage(1); setFilters({ ...filters, class_id: e.target.value }); }}>
          <option value="">كل الشعب</option>
          {options.classes.filter(c => String(c.level_id) === String(filters.level_id)).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={load}>تحديث</button>
      </div>

      {rows.length === 0 ? (
        <Empty icon="📭" title="لا يوجد تلاميذ في هذه الدورة" hint="لم تُسجَّل أي دورة دفع أو لا توجد نتائج مطابقة للفلاتر." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>رقم التسجيل</th>
                <th>الطالب</th>
                <th>المستوى</th>
                <th>الأشهر التي لم دفعها</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.student_id}>
                  <td className="mono">{s.reg_number}</td>
                  <td style={{ fontWeight: 800 }}>
                    <button type="button" className="link-name" onClick={() => openHistory(s)}>{s.first_name} {s.last_name}</button>
                  </td>
                  <td>{s.level_name || '—'}</td>
                  <td><UnpaidMonths months={s.unpaid_months} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.pages > 1 && (
        <div className="pager">
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span className="small text-muted">صفحة {page} من {state.pages} — {state.total} تلميذ</span>
          <button className="btn btn-ghost btn-sm" disabled={page >= state.pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}

      <Modal
        open={!!studentHistory}
        onClose={() => setStudentHistory(null)}
        wide
        title={studentHistory ? `سجل الدفعات: ${studentHistory.student.first_name} ${studentHistory.student.last_name}` : ''}
      >
        {studentHistory && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>الدورة</th><th>من</th><th>إلى</th><th>الحالة</th><th>المبلغ</th><th>تاريخ الدفع</th></tr>
                </thead>
                <tbody>
                  {studentHistory.cycles.map(c => (
                    <tr key={c.cycle_id} style={c.is_current ? { fontWeight: 800 } : undefined}>
                      <td>{c.label}{c.is_current && ' (الحالية)'}</td>
                      <td className="mono">{c.start_date}</td>
                      <td className="mono">{c.end_date}</td>
                      <td>{c.status === 'PAID' ? <Badge kind="green">مدفوع</Badge> : <Badge kind="red">غير مدفوع</Badge>}</td>
                      <td className="mono">{c.amount === null ? '—' : `${c.amount} دج`}</td>
                      <td className="mono">{c.paid_at || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {studentHistory.audit.length > 0 && (
              <div className="mt-18">
                <h3 className="small" style={{ fontWeight: 800 }}>سجل التغييرات</h3>
                <div className="table-wrap mt-12">
                  <table>
                    <thead><tr><th>التاريخ</th><th>الإجراء</th><th>من</th><th>إلى</th><th>المبلغ</th></tr></thead>
                    <tbody>
                      {studentHistory.audit.map(a => (
                        <tr key={a.id}>
                          <td className="mono small">{a.created_at}</td>
                          <td>{({ RECORD: 'تسجيل', UPDATE: 'تعديل', CANCEL: 'إلغاء', MIGRATE: 'ترحيل' })[a.action] || a.action}</td>
                          <td>{a.from_status || '—'}</td>
                          <td>{a.to_status || '—'}</td>
                          <td className="mono">{a.amount === null ? '—' : a.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}