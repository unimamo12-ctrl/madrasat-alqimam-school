import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
import { Loading, Empty, Modal, Field } from '../../components/ui';
import { useToast } from '../../components/Toast';

export default function AdminSubjects() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ id: null, name: '' });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(() => {
    apiGet('/admin/subjects').then(d => setRows(d.subjects)).catch(e => toast.error(e.message));
  }, [toast]);
  useEffect(load, [load]);

  async function save() {
    if (!form.name.trim()) { toast.error('اسم المادة مطلوب.'); return; }
    setBusy(true);
    try {
      if (form.id) { await apiPut(`/admin/subjects/${form.id}`, form); toast.success('تم تعديل المادة.'); }
      else { await apiPost('/admin/subjects', form); toast.success('تمت إضافة المادة.'); }
      setModal(null); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function del() {
    setBusy(true);
    try { await apiDelete(`/admin/subjects/${confirmDel.id}`); toast.success('تم الحذف.'); setConfirmDel(null); load(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <h1>المواد</h1>
        <p className="sub">إدارة المواد الدراسية</p>
      </div>
      <div className="filterbar">
        <button className="btn btn-primary btn-sm" onClick={() => { setForm({ id: null, name: '' }); setModal('edit'); }}>+ إضافة مادة</button>
      </div>
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty icon="📚" title="لا توجد مواد بعد" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>الاسم</th><th>إجراءات</th></tr></thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 800 }}>{s.name}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setForm(s); setModal('edit'); }}>تعديل</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(s)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title={form.id ? 'تعديل مادة' : 'إضافة مادة'}
        footer={<>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '...' : 'حفظ'}</button>
          <button className="btn btn-ghost" onClick={() => setModal(null)}>إلغاء</button>
        </>}>
        <Field label="اسم المادة *"><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
      </Modal>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="حذف مادة"
        footer={<>
          <button className="btn btn-danger" onClick={del} disabled={busy}>{busy ? '...' : 'نعم، احذف'}</button>
          <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>إلغاء</button>
        </>}>
        <p>هل أنت متأكد من حذف مادة <b>{confirmDel?.name}</b>؟</p>
      </Modal>
    </div>
  );
}