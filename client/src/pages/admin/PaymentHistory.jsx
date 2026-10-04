import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import { Loading, Empty, Modal, Badge } from '../../components/ui';

const ACTION_LABEL = { RECORD: 'تسجيل دفع', UPDATE: 'تعديل', CANCEL: 'إلغاء الدفع', MIGRATE: 'ترحيل من النظام القديم' };

export default function AdminPaymentHistory() {
  const [state, setState] = useState({ loading: true, error: null, cycles: [], current: null, today: null });
  const [detail, setDetail] = useState(null);
  const [audit, setAudit] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const d = await apiGet('/admin/payment-cycles');
      setState({ loading: false, error: null, cycles: d.cycles, current: d.current, today: d.today });
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openCycle(cycle) {
    setDetail({ cycle, loading: true, rows: [], total: 0, pages: 1 });
    try {
      const d = await apiGet(`/admin/payment-cycles/${cycle.id}/payments`, { status, page, per_page: 25 });
      setDetail({ cycle: d.cycle, loading: false, rows: d.rows, total: d.total, pages: d.pages });
    } catch (e) {
      setDetail(null);
    }
  }

  async function openAudit(cycle) {
    try {
      const d = await apiGet(`/admin/payment-cycles/${cycle.id}/audit`);
      setAudit({ cycle, rows: d.audit });
    } catch (e) { /* ignore */ }
  }

  if (state.loading && state.cycles.length === 0) return <Loading />;

  return (
    <div>
      <div className="page-header">
        <h1>سجل الدفعات</h1>
        <p className="sub">كل الدورات الشهرية مع حالة كل تلميذ — كل دورة مستقلة ولا تؤثر على الأخرى</p>
      </div>

      {state.error && <div className="state-box"><div className="big">⚠️</div><div className="title">{state.error}</div></div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الدورة</th>
              <th>من</th>
              <th>إلى</th>
              <th>الإجمالي</th>
              <th>سدّدوا</th>
              <th>لم يدفعوا</th>
              <th>المحصّل</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.cycles.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 800 }}>
                  {c.label}
                  {c.is_current && <Badge kind="gold" >الحالية</Badge>}
                </td>
                <td className="mono">{c.start_date}</td>
                <td className="mono">{c.end_date}</td>
                <td>{c.total}</td>
                <td style={{ color: 'var(--success, #16a34a)', fontWeight: 800 }}>{c.paid}</td>
                <td style={{ color: 'var(--danger)', fontWeight: 800 }}>{c.unpaid}</td>
                <td className="mono">{c.collected} دج</td>
                <td>{c.is_current ? <Badge kind="gold">جارية</Badge> : c.is_future ? <Badge kind="gray">مستقبلية</Badge> : <Badge kind="gray">منتهية</Badge>}</td>
                <td>
                  <div className="table-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => { setPage(1); setStatus(''); openCycle(c); }}>التفاصيل</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openAudit(c)}>سجل التغييرات</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.cycles.length === 0 && <Empty icon="💳" title="لا توجد دورات بعد" />}

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        wide
        title={detail?.cycle ? `سجل دفعة ${detail.cycle.label}` : ''}
      >
        {detail && (
          <>
            <div className="stat-grid mb-18">
              <div className="stat-card"><div className="stat-icon" style={{ background: '#eff6ff' }}>👥</div><div><div className="num">{detail.cycle.total}</div><div className="lbl">الإجمالي</div></div></div>
              <div className="stat-card"><div className="stat-icon" style={{ background: '#dcfce7' }}>✅</div><div><div className="num">{detail.cycle.paid}</div><div className="lbl">سدّدوا</div></div></div>
              <div className="stat-card"><div className="stat-icon" style={{ background: '#fee2e2' }}>⛔</div><div><div className="num">{detail.cycle.unpaid}</div><div className="lbl">لم يدفعوا</div></div></div>
            </div>

            <div className="filterbar">
              <select className="select" value={status} onChange={e => { setPage(1); setStatus(e.target.value); }}>
                <option value="">كل الحالات</option>
                <option value="PAID">مسدد</option>
                <option value="UNPAID">غير مسدد</option>
              </select>
            </div>

            {detail.loading ? <Loading /> : detail.rows.length === 0 ? (
              <Empty icon="🗒️" title="لا توجد سجلات" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>التلميذ</th><th>رقم التسجيل</th><th>المستوى</th><th>الحالة</th><th>المبلغ</th><th>تاريخ الدفع</th></tr>
                  </thead>
                  <tbody>
                    {detail.rows.map(r => (
                      <tr key={r.payment_id}>
                        <td style={{ fontWeight: 800 }}>{r.first_name} {r.last_name}</td>
                        <td className="mono">{r.reg_number}</td>
                        <td>{r.level_name || '—'}</td>
                        <td>{r.status === 'PAID' ? <Badge kind="green">مدفوع</Badge> : <Badge kind="red">غير مدفوع</Badge>}</td>
                        <td className="mono">{r.amount === null || r.amount === undefined ? '—' : `${r.amount} دج`}</td>
                        <td className="mono">{r.paid_at || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {detail.pages > 1 && (
              <div className="pager">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => { setPage(page - 1); openCycle(detail.cycle); }}>السابق</button>
                <span className="small text-muted">صفحة {page} من {detail.pages} — {detail.total} سجل</span>
                <button className="btn btn-ghost btn-sm" disabled={page >= detail.pages} onClick={() => { setPage(page + 1); openCycle(detail.cycle); }}>التالي</button>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal open={!!audit} onClose={() => setAudit(null)} wide title={audit ? `سجل التغييرات — ${audit.cycle.label}` : ''}>
        {audit && (
          audit.rows.length === 0 ? <Empty icon="🗒️" title="لا توجد تغييرات مسجلة" /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>التاريخ</th><th>التلميذ</th><th>الإجراء</th><th>من</th><th>إلى</th><th>المبلغ</th><th>المستخدم</th></tr>
                </thead>
                <tbody>
                  {audit.rows.map(a => (
                    <tr key={a.id}>
                      <td className="mono small">{a.created_at}</td>
                      <td className="mono">#{a.student_id}</td>
                      <td>{ACTION_LABEL[a.action] || a.action}</td>
                      <td>{a.from_status || '—'}</td>
                      <td>{a.to_status || '—'}</td>
                      <td className="mono">{a.amount === null ? '—' : a.amount}</td>
                      <td>{a.username || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Modal>
    </div>
  );
}