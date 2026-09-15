import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
import { Loading, Empty, Modal, Field } from '../../components/ui';
import { useToast } from '../../components/Toast';

export default function AdminLevels() {
  const toast = useToast();
  const [levels, setLevels] = useState(null);
  const [classes, setClasses] = useState(null);
  const [lvlModal, setLvlModal] = useState(null);
  const [clsModal, setClsModal] = useState(null);
  const [lvlForm, setLvlForm] = useState({ id: null, name: '' });
  const [clsForm, setClsForm] = useState({ id: null, name: '', level_id: '' });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(() => {
    Promise.all([apiGet('/admin/levels'), apiGet('/admin/classes')])
      .then(([l, c]) => { setLevels(l.levels); setClasses(c.classes); })
      .catch(e => toast.error(e.message));
  }, [toast]);
  useEffect(load, [load]);

  async function saveLevel() {
    if (!lvlForm.name.trim()) { toast.error('اسم المستوى مطلوب.'); return; }
    setBusy(true);
    try {
      if (lvlForm.id) { await apiPut(`/admin/levels/${lvlForm.id}`, lvlForm); toast.success('تم تعديل المستوى.'); }
      else { await apiPost('/admin/levels', lvlForm); toast.success('تمت إضافة المستوى.'); }
      setLvlModal(null); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function saveClass() {
    if (!clsForm.name.trim() || !clsForm.level_id) { toast.error('الاسم والمستوى مطلوبان.'); return; }
    setBusy(true);
    try {
      if (clsForm.id) { await apiPut(`/admin/classes/${clsForm.id}`, clsForm); toast.success('تم تعديل الشعبة.'); }
      else { await apiPost('/admin/classes', clsForm); toast.success('تمت إضافة الشعبة.'); }
      setClsModal(null); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function del() {
    setBusy(true);
    try {
      const isLevel = confirmDel.type === 'level';
      if (isLevel) await apiDelete(`/admin/levels/${confirmDel.id}`);
      else await apiDelete(`/admin/classes/${confirmDel.id}`);
      toast.success('تم الحذف.'); setConfirmDel(null); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <h1>المستويات والشعب</h1>
        <p className="sub">إدارة المستويات وشعبها</p>
      </div>

      <div className="flex wrap mb-18">
        <button className="btn btn-primary btn-sm" onClick={() => { setLvlForm({ id: null, name: '' }); setLvlModal('edit'); }}>+ إضافة مستوى</button>
        <button className="btn btn-accent btn-sm" onClick={() => { setClsForm({ id: null, name: '', level_id: levels?.[0]?.id || '' }); setClsModal('edit'); }}>+ إضافة شعبة</button>
      </div>

      {levels === null ? <Loading /> : levels.length === 0 ? <Empty icon="🏫" title="لا توجد مستويات" /> : (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="card" style={{ padding: 16 }}>
            <h3 className="mb-12">المستويات ({levels.length})</h3>
            {levels.map(l => (
              <div key={l.id} className="flex between mt-8" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                <span style={{ fontWeight: 800 }}>{l.name}</span>
                <div className="flex">
                  <button className="btn btn-ghost btn-sm" onClick={() => { setLvlForm({ id: l.id, name: l.name }); setLvlModal('edit'); }}>تعديل</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel({ id: l.id, type: 'level', label: l.name })}>✕</button>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 className="mb-12">الشعب ({classes?.length || 0})</h3>
            {classes.length === 0 ? <Empty icon="🗂️" title="لا توجد شعب" /> : (
              <div className="table-wrap">
                <table style={{ minWidth: 0 }}>
                  <thead><tr><th>المستوى</th><th>الشعبة</th><th></th></tr></thead>
                  <tbody>
                    {classes.map(c => (
                      <tr key={c.id}>
                        <td className="small">{c.level_name}</td>
                        <td style={{ fontWeight: 800 }}>{c.name}</td>
                        <td>
                          <div className="table-actions">
                            <button className="btn btn-ghost btn-sm" onClick={() => { setClsForm({ id: c.id, name: c.name, level_id: c.level_id }); setClsModal('edit'); }}>تعديل</button>
                            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel({ id: c.id, type: 'class', label: c.name })}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={lvlModal === 'edit'} onClose={() => setLvlModal(null)} title={lvlForm.id ? 'تعديل مستوى' : 'إضافة مستوى'}
        footer={<>
          <button className="btn btn-primary" onClick={saveLevel} disabled={busy}>{busy ? '...' : 'حفظ'}</button>
          <button className="btn btn-ghost" onClick={() => setLvlModal(null)}>إلغاء</button>
        </>}>
        <Field label="اسم المستوى *"><input className="input" value={lvlForm.name} onChange={e => setLvlForm({ ...lvlForm, name: e.target.value })} /></Field>
      </Modal>

      <Modal open={clsModal === 'edit'} onClose={() => setClsModal(null)} title={clsForm.id ? 'تعديل شعبة' : 'إضافة شعبة'}
        footer={<>
          <button className="btn btn-primary" onClick={saveClass} disabled={busy}>{busy ? '...' : 'حفظ'}</button>
          <button className="btn btn-ghost" onClick={() => setClsModal(null)}>إلغاء</button>
        </>}>
        <Field label="المستوى *">
          <select className="select" value={clsForm.level_id} onChange={e => setClsForm({ ...clsForm, level_id: e.target.value })}>
            {levels?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="اسم الشعبة *"><input className="input" value={clsForm.name} onChange={e => setClsForm({ ...clsForm, name: e.target.value })} /></Field>
      </Modal>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="تأكيد الحذف"
        footer={<>
          <button className="btn btn-danger" onClick={del} disabled={busy}>{busy ? '...' : 'نعم، احذف'}</button>
          <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>إلغاء</button>
        </>}>
        <p>هل أنت متأكد من حذف <b>{confirmDel?.label}</b>؟</p>
      </Modal>
    </div>
  );
}