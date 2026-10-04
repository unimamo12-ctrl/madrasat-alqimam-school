import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api';
import { Loading, Empty, Modal, Badge } from '../../components/ui';
import { useToast } from '../../components/Toast';

const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

export default function AdminPayments() {
  const toast = useToast();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [stats, setStats] = useState(null);
  const [cycleId, setCycleId] = useState('');
  const [today, setToday] = useState('');
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ q: '', level_id: '', class_id: '', status: '' });
  const [options, setOptions] = useState({ levels: [], classes: [] });
  const [page, setPage] = useState(1);
  const [pay, setPay] = useState(null);
  const [due, setDue] = useState(null);
  const [dueErr, setDueErr] = useState(null);
  const [picked, setPicked] = useState({});
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [busy, setBusy] = useState(false);

  // دورة اليوم افتراضياً
  useEffect(() => {
    (async () => {
      try {
        const d = await apiGet('/admin/payment-cycles/current');
        setToday(d.today || '');
if (d.cycle) { applyCycle(d); setFromDate(d.cycle.start_date); setToDate(d.cycle.end_date); }
        else if (d.today) setFromDate(d.today);
      } catch (e) { toast.error(e.message); }
    })();
    apiGet('/admin/settings/options')
      .then(o => setOptions({ levels: o.levels, classes: o.classes }))
      .catch(() => { });
  }, [toast]);

  function applyCycle(d) {
    setStats(d.stats);
    setCycleId(String(d.cycle.id));
  }

// كتابة الفترة «من / إلى» كما هي → النظام يعرض الدورة التي تحتويها (12 ← 11)
  async function resolveRange() {
    let f = String(fromDate || '').slice(0, 10);
    let t = String(toDate || '').slice(0, 10);
    if (!isDate(f)) { toast.error('اختر تاريخ بداية صحيح (YYYY-MM-DD).'); return; }
    if (isDate(t) && t < f) { const s = f; f = t; t = s; }
    if (!isDate(t)) t = '';
    setFromDate(f);
    setToDate(t);
    try {
      const d = await apiGet('/admin/payment-cycles/by-date', { date: f });
      applyCycle(d);
      setPage(1);
    } catch (err) { toast.error(err.message); }
  }

  const load = useCallback(async () => {
    if (!cycleId) return;
    setData({ loading: true });
    try {
      const d = await apiGet(`/admin/payment-cycles/${cycleId}/payments`, { ...filters, page, per_page: 25 });
      setData(d);
      if (d.today) setToday(d.today);
    } catch (e) { toast.error(e.message); }
  }, [cycleId, filters, page, toast]);

  useEffect(() => { load(); }, [load]);

// تسجيل/إلغاء الدفع: يغيّر حالة الصف فقط — لا إخفاء، لا حذف، لا إعادة ترتيب، لا إعادة تحميل للقائمة
  async function cancelPayment(row) {
    setBusy(true);
    try {
      const res = await apiPost(`/admin/payment-cycles/${cycleId}/payments/${row.student_id}/cancel`, {});
      toast.success(res.message);
      patchRow(row.student_id, { status: 'UNPAID', paid_at: null });
      await refreshStats();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  // تحديث صف واحد في مكانه (ترتيب الصفحة كما هو — لا sort ولا refetch)
  function patchRow(studentId, changes) {
    setData(d => {
      if (!d) return d;
      return { ...d, rows: (d.rows || []).map(r => (Number(r.student_id) === Number(studentId) ? { ...r, ...changes } : r)) };
    });
  }

  // تحديث إحصاءات الدورة فقط (لا يمس ترتيب أو صفوف الجدول)
async function refreshStats() {
    if (!fromDate || !isDate(fromDate)) return;
    try {
      const d = await apiGet('/admin/payment-cycles/by-date', { date: fromDate });
      setStats(d.stats);
    } catch { /* تجاهل */ }
  }

// فتح نافذة الدفع + تحميل كل أشهر الطالب غير المدفوعة (لتسديد عدة أشهر معاً)
  async function openPay(row) {
    setPay(row);
    setAmount('');
    setPaidAt(String(today || '').slice(0, 10));
    setDue(null);
    setDueErr(null);
    setPicked({});
    try {
      const d = await apiGet(`/admin/payment-cycles/student/${row.student_id}/due`);
      setDue(d);
      const initial = {};
      for (const c of (d.due || [])) initial[c.id] = true;
      setPicked(initial);
    } catch (e) { setDueErr(e.message); }
  }

  function toggleMonth(id) {
    setPicked(p => ({ ...p, [id]: !p[id] }));
  }

  // تسجيل الدفع: شهر واحد أو عدة أشهر متأخرة في عملية واحدة
  async function savePayment() {
    const chosen = (due ? due.due : []).filter(c => picked[c.id]);
    if (amount === '' || isNaN(Number(amount)) || Number(amount) < 0) { toast.error('أدخل مبلغاً صحيحاً.'); return; }
    if (!chosen.length) { toast.error('اختر شهراً واحداً على الأقل للسداد.'); return; }
    if (!paidAt) { toast.error('اختر تاريخ الدفع.'); return; }
    setBusy(true);
    try {
      if (chosen.length === 1) {
        const res = await apiPost(`/admin/payment-cycles/${chosen[0].id}/payments`, {
          student_id: pay.student_id, amount: Number(amount), paid_at: paidAt
        });
        toast.success(res.message);
        const paid = res.payment || {};
        patchRow(pay.student_id, {
          status: 'PAID',
          amount: Number(paid.amount === undefined || paid.amount === null ? amount : paid.amount),
          paid_at: paid.paid_at || paidAt
        });
      } else {
        const res = await apiPost('/admin/payment-cycles/payments/bulk', {
          student_id: pay.student_id,
          paid_at: paidAt,
          items: chosen.map(c => ({ cycle_id: c.id, amount: Number(amount) }))
        });
        toast.success(res.message);
        // إذا كانت الدورة المعروضة ضمن المسدَّدة → يبقى الصف في مكانه ويصبح «تم الدفع»
        const nowRow = chosen.find(c => String(c.id) === String(cycleId));
        if (nowRow) patchRow(pay.student_id, { status: 'PAID', amount: Number(amount), paid_at: paidAt });
      }
      setPay(null);
      setAmount('');
      setPaidAt('');
      await refreshStats();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  if (!cycleId && !stats) return <Loading />;

  return (
    <div>
      <div className="page-header">
        <h1>إدارة الدفع الشهري</h1>
<p className="sub">حدّد الفترة «من / إلى» والنظام يعرض الدورة التي تحتويها (دورة شهر كامل: من 12 إلى 11) — تسجيل الدفع على أي دورة (حتى دورة سابقة = دفع متأخر)</p>
      </div>

      <div className="filterbar">
        <label className="small" style={{ fontWeight: 800 }}>من:</label>
        <input
          className="input mono"
          dir="ltr"
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') resolveRange(); }}
          style={{ maxWidth: 180 }}
        />
        <label className="small" style={{ fontWeight: 800 }}>إلى:</label>
        <input
          className="input mono"
          dir="ltr"
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') resolveRange(); }}
          style={{ maxWidth: 180 }}
        />
        <button className="btn btn-primary btn-sm" onClick={resolveRange} disabled={!isDate(fromDate)}>عرض الدورة</button>
        {stats && (
          <span className="small text-muted">
            الفترة: <span className="mono">{fromDate || '—'}{toDate ? ` ← ${toDate}` : ''}</span>
            {` · الدورة المعروضة: `}
            <strong>{stats.label}</strong> — <span className="mono">{stats.start_date} ← {stats.end_date}</span>
            {stats.is_current && ' — الحالية'}
          </span>
        )}
      </div>

      {stats && (
        <div className="stat-grid mb-18">
          <div className="stat-card"><div className="stat-icon" style={{ background: '#eff6ff' }}>👥</div><div><div className="num">{stats.total}</div><div className="lbl">إجمالي التلاميذ</div></div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: '#dcfce7' }}>✅</div><div><div className="num">{stats.paid}</div><div className="lbl">سدّدوا</div></div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: '#fee2e2' }}>⛔</div><div><div className="num">{stats.unpaid}</div><div className="lbl">لم يدفعوا</div></div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: '#fef3c7' }}>💰</div><div><div className="num">{stats.collected} دج</div><div className="lbl">المحصّل</div></div></div>
        </div>
      )}

      <div className="filterbar">
        <div className="search-box">
          <span className="sico">🔍</span>
          <input className="input" placeholder="بحث بالاسم أو رقم التسجيل..." value={filters.q} onChange={e => { setPage(1); setFilters({ ...filters, q: e.target.value }); }} />
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
        <select className="select" value={filters.status} onChange={e => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}>
          <option value="">كل الحالات</option>
          <option value="PAID">مسدد</option>
          <option value="UNPAID">غير مسدد</option>
        </select>
      </div>

      {!data || data.loading ? <Loading /> : data.rows.length === 0 ? (
        <Empty icon="🗒️" title="لا توجد سجلات مطابقة" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>رقم التسجيل</th><th>الطالب</th><th>المستوى</th><th>الشعبة</th>
                <th>الحالة</th><th>المبلغ</th><th>تاريخ الدفع</th><th>الدفع</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={r.payment_id}>
                  <td className="mono">{r.reg_number}</td>
                  <td style={{ fontWeight: 800 }}>{r.first_name} {r.last_name}</td>
                  <td>{r.level_name || '—'}</td>
                  <td>{r.class_name || '—'}</td>
                  <td>{r.status === 'PAID' ? <Badge kind="green">مدفوع</Badge> : <Badge kind="red">غير مدفوع</Badge>}</td>
                  <td className="mono">{r.amount === null || r.amount === undefined ? '—' : `${r.amount} دج`}</td>
                  <td className="mono">{r.paid_at || '—'}</td>
                  <td>
                    {r.status === 'PAID' ? (
                      <div className="pay-cell">
                        <span className="pay-done">تم الدفع ✓</span>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => cancelPayment(r)}>إلغاء الدفع</button>
                      </div>
                    ) : (
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => openPay(r)}>تسجيل الدفع</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="pager">
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span className="small text-muted">صفحة {page} من {data.pages} — {data.total} سجل</span>
          <button className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}

      <Modal
        open={!!pay}
        onClose={() => setPay(null)}
        title={pay ? `تسجيل دفع: ${pay.first_name} ${pay.last_name}` : ''}
footer={<>
          <button className="btn btn-primary" onClick={savePayment} disabled={busy || !pay}>
            {busy ? '...' : `تأكيد السداد${(due ? due.due.filter(c => picked[c.id]).length : 0) > 1 ? ` (${due.due.filter(c => picked[c.id]).length} أشهر)` : ''}`}
          </button>
          <button className="btn btn-ghost" onClick={() => setPay(null)}>إلغاء</button>
        </>}
      >
        {pay && stats && (
          <>
            <div className="info-list mb-18">
              <div className="info-item"><div className="k">رقم التسجيل</div><div className="v mono">{pay.reg_number}</div></div>
              <div className="info-item"><div className="k">الدورة المعروضة</div><div className="v">{stats.label}</div></div>
              <div className="info-item"><div className="k">الاستحقاق</div><div className="v mono">{stats.start_date} ← {stats.end_date}</div></div>
            </div>

            {dueErr && <div className="hint" style={{ color: 'var(--danger)' }}>{dueErr}</div>}
            {!due && !dueErr && <div className="hint">جارٍ تحميل أشهر الطالب غير المدفوعة…</div>}

            {due && (
              <>
                <div className="field">
                  <label>الأشهر غير المدفوعة (اختر ما تريد سداده الآن)</label>
                  {due.due.length === 0 ? (
                    <div className="hint">لا توجد أشهر غير مدفوعة — كل الدورات مسددة.</div>
                  ) : (
                    <div className="due-list">
                      {due.due.map(c => (
                        <label key={c.id} className={`due-row${picked[c.id] ? ' on' : ''}`}>
                          <input type="checkbox" checked={!!picked[c.id]} onChange={() => toggleMonth(c.id)} />
                          <span className="due-name">{c.label}</span>
                          <span className="mono small text-muted">{c.start_date} ← {c.end_date}</span>
                          {c.is_current && <Badge kind="green">الحالية</Badge>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="field">
                  <label>المبلغ لكل شهر (دج)</label>
                  <input className="input mono" dir="ltr" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="مثال: 3000" />
                  <span className="hint">
                    {due.due.filter(c => picked[c.id]).length} شهر × {Number(amount) || 0} دج = الإجمالي:{' '}
                    <strong className="mono">{((Number(amount) || 0) * due.due.filter(c => picked[c.id]).length).toLocaleString('fr-FR')} دج</strong>
                  </span>
                </div>

                <div className="field">
                  <label>تاريخ الدفع</label>
                  <input className="input mono" dir="ltr" type="date" value={paidAt} max={today || undefined} onChange={e => setPaidAt(e.target.value)} />
                  <span className="hint">يُسجَّل نفس التاريخ لكل الأشهر المختارة — سجل كامل ودقيق.</span>
                </div>
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}