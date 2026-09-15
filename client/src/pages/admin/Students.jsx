import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '../../lib/api';
import { Loading, Empty, ErrorState, Modal, Field, StatusBadge, Badge } from '../../components/ui';
import { useToast } from '../../components/Toast';

const EMPTY = { id: null, first_name: '', last_name: '', reg_number: '', phone: '', level_id: '', class_id: '', academic_year_id: '', status: 1 };

export default function AdminStudents() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [options, setOptions] = useState({ levels: [], classes: [], years: [] });
  const [filters, setFilters] = useState({ q: '', level_id: '', class_id: '', status: '' });
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([apiGet('/admin/students', filters), apiGet('/admin/settings/options')]);
      setRows(s.students);
      setOptions({ levels: o.levels, classes: o.classes, years: o.years });
    } catch (e) { toast.error(e.message); }
  }, [filters, toast]);

  useEffect(() => { load(); }, [load]);

  const classesFor = options.classes.filter(c => String(c.level_id) === String(form.level_id || filters.level_id || options.levels[0]?.id));

  function openAdd() { setForm(EMPTY); setModal('edit'); }
  function openEdit(s) {
    setForm({ ...s, level_id: s.level_id, class_id: s.class_id, academic_year_id: s.academic_year_id, status: s.status });
    setModal('edit');
  }

  async function save() {
    const missing = !form.first_name.trim() || !form.last_name.trim() || !form.reg_number.trim() || !form.level_id;
    if (missing) { toast.error('يرجى ملء الحقول الإلزامية (الاسم، اللقب، رقم التسجيل، المستوى).'); return; }
    setBusy(true);
    try {
      if (form.id) {
        const { first_name, last_name, reg_number, phone, level_id, class_id, academic_year_id, status } = form;
        await apiPut(`/admin/students/${form.id}`, { first_name, last_name, reg_number, phone, level_id, class_id, academic_year_id, status });
        toast.success('تم تحديث التلميذ بنجاح.');
      } else {
        await apiPost('/admin/students', form);
        toast.success('تمت إضافة التلميذ بنجاح.');
      }
      setModal(null);
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function toggleStatus(s) {
    try {
      await apiPatch(`/admin/students/${s.id}/status`, { status: s.status ? 0 : 1 });
      toast.success(s.status ? 'تم تعطيل الحساب.' : 'تم تفعيل الحساب.');
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function del() {
    setBusy(true);
    try { await apiDelete(`/admin/students/${confirmDel.id}`); toast.success('تم حذف التلميذ.'); setConfirmDel(null); load(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  function pickLevel(lid) {
    setForm({ ...form, level_id: lid, class_id: '' });
  }

  return (
    <div>
      <div className="page-header">
        <h1>إدارة التلاميذ</h1>
        <p className="sub">إضافة وتعديل وحذف وتعطيل حسابات التلاميذ</p>
      </div>

      <div className="filterbar">
        <div className="search-box">
          <span className="sico">🔍</span>
          <input className="input" placeholder="بحث بالاسم أو اللقب أو رقم التسجيل أو الهاتف..." value={filters.q}
                 onChange={e => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <select className="select" value={filters.level_id} onChange={e => setFilters({ ...filters, level_id: e.target.value, class_id: '' })}>
          <option value="">كل المستويات</option>
          {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="select" value={filters.class_id} onChange={e => setFilters({ ...filters, class_id: e.target.value })}>
          <option value="">كل الشعب</option>
          {options.classes.filter(c => String(c.level_id) === String(filters.level_id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
          <option value="">كل الحالات</option>
          <option value="1">فعال</option>
          <option value="0">غير فعال</option>
        </select>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ إضافة تلميذ</button>
      </div>

      {rows === null ? <Loading /> : rows.length === 0 ? (
        <Empty icon="🎓" title="لا يوجد تلاميذ مطابقون" hint="أضف أول تلميذ ليتمكن من تسجيل الدخول." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>الاسم</th><th>اللقب</th><th>رقم التسجيل</th><th>الهاتف</th><th>المستوى</th><th>الشعبة</th><th>السنة</th><th>اختيارات</th><th>الحالة</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 800 }}>{s.first_name}</td>
                  <td>{s.last_name}</td>
                  <td className="mono">{s.reg_number}</td>
                  <td className="mono">{s.phone || '—'}</td>
                  <td>{s.level_name}</td>
                  <td>{s.class_name || '—'}</td>
                  <td className="small">{s.year_name || '—'}</td>
                  <td><Badge kind="blue">{s.selections_count}</Badge></td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>تعديل</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(s)}>{s.status ? 'تعطيل' : 'تفعيل'}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(s)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title={form.id ? 'تعديل تلميذ' : 'إضافة تلميذ جديد'}
        footer={<>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '...' : 'حفظ'}</button>
          <button className="btn btn-ghost" onClick={() => setModal(null)}>إلغاء</button>
        </>}>
        <div className="grid-2">
          <Field label="الاسم *"><input className="input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></Field>
          <Field label="اللقب *"><input className="input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></Field>
        </div>
        <Field label="رقم التسجيل *" hint="رقم فريد يُستعمل لتسجيل دخول التلميذ">
          <input className="input mono" dir="ltr" value={form.reg_number} onChange={e => setForm({ ...form, reg_number: e.target.value })} />
        </Field>
        <Field label="رقم الهاتف" hint="لتواصل الإدارة مع ولي الأمر (اختياري)">
          <input className="input mono" dir="ltr" placeholder="05xxxxxxxx" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="المستوى *">
          <select className="select" value={form.level_id} onChange={e => pickLevel(e.target.value)}>
            <option value="">اختر المستوى...</option>
            {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="الشعبة">
          <select className="select" value={form.class_id} onChange={e => setForm({ ...form, class_id: e.target.value })} disabled={!form.level_id}>
            <option value="">—</option>
            {classesFor.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="السنة الدراسية">
          <select className="select" value={form.academic_year_id} onChange={e => setForm({ ...form, academic_year_id: e.target.value })}>
            <option value="">—</option>
            {options.years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_active ? ' (نشطة)' : ''}</option>)}
          </select>
        </Field>
        <Field label="حالة الحساب">
          <select className="select" value={form.status} onChange={e => setForm({ ...form, status: Number(e.target.value) })}>
            <option value={1}>فعال</option>
            <option value={0}>غير فعال</option>
          </select>
        </Field>
      </Modal>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="حذف التلميذ"
        footer={<>
          <button className="btn btn-danger" onClick={del} disabled={busy}>{busy ? '...' : 'نعم، احذف'}</button>
          <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>إلغاء</button>
        </>}>
        <p>هل أنت متأكد من حذف <b>{confirmDel?.first_name} {confirmDel?.last_name}</b> نهائياً؟ سيتم حذف حساب الدخول والاختيارات والدفعات.</p>
      </Modal>
    </div>
  );
}