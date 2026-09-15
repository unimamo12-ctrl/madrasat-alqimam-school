import { useCallback, useEffect, useState } from 'react';
import { apiGet, uploadPost, uploadPut, apiDelete } from '../../lib/api';
import { Loading, Empty, Modal, Field, Badge } from '../../components/ui';
import { useToast } from '../../components/Toast';

const EMPTY = { id: null, message: '', status: 1, images: [], files: [], removed: [] };

export default function AdminAnnouncements() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet('/admin/announcements');
      setRows(d.announcements);
    } catch (e) { toast.error(e.message); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setForm(EMPTY); setModal('edit'); }
  function openEdit(a) { setForm({ ...a, images: [...(a.images || [])], files: [], removed: [] }); setModal('edit'); }

  function removeExisting(img) {
    setForm(f => ({ ...f, removed: [...f.removed, img], images: f.images.filter(i => i !== img) }));
  }

  async function save() {
    if (!form.message.trim() && form.files.length === 0 && form.images.length === 0) {
      toast.error('اكتب نص الإعلان أو ارفع صورة.'); return;
    }
    const fd = new FormData();
    fd.append('message', form.message);
    fd.append('status', form.status ? 1 : 0);
    if (form.removed.length) fd.append('removed_images', JSON.stringify(form.removed));
    form.files.forEach(f => fd.append('images', f));
    setBusy(true);
    try {
      if (form.id) {
        await uploadPut(`/admin/announcements/${form.id}`, fd);
        toast.success('تم تحديث الإعلان.');
      } else {
        await uploadPost('/admin/announcements', fd);
        toast.success('تم نشر الإعلان.');
      }
      setModal(null);
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function del() {
    setBusy(true);
    try { await apiDelete(`/admin/announcements/${confirmDel.id}`); toast.success('تم حذف الإعلان.'); setConfirmDel(null); load(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <h1>الإعلانات</h1>
        <p className="sub">اكتب إعلاناً وارفع صوره ليظهر للتلاميذ في الصفحة الرئيسية</p>
      </div>

      <div className="filterbar">
        <div className="search-box" style={{ flex: 1 }}>
          <span className="sico">📣</span>
          <span className="input" style={{ border: 'none', background: 'transparent' }}>كل ما تنشره هنا يظهر مباشرة للتلاميذ في الرئيسية.</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ إعلان جديد</button>
      </div>

      {rows === null ? <Loading /> : rows.length === 0 ? (
        <Empty icon="📣" title="لا توجد إعلانات بعد" hint="أنشئ أول إعلان ليظهر للتلاميذ في الصفحة الرئيسية." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>النص</th><th>الصور</th><th>الحالة</th><th>تاريخ النشر</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 700, maxWidth: 380 }}>{a.message || <em className="text-muted">(بدون نص)</em>}</td>
                  <td>
                    <div className="ann-thumbs">
                      {a.images.length === 0 ? <span className="text-muted small">—</span> :
                        a.images.slice(0, 3).map((img, i) => (
                          <img key={i} src={img} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                        ))}
                      {a.images.length > 3 && <span className="small text-muted">+{a.images.length - 3}</span>}
                    </div>
                  </td>
                  <td>{a.status ? <Badge kind="green">منشور</Badge> : <Badge kind="red">مخفي</Badge>}</td>
                  <td className="small">{String(a.created_at || '').replace('T', ' ')}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}>تعديل</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(a)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title={form.id ? 'تعديل الإعلان' : 'إعلان جديد'} wide
        footer={<>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '...' : 'نشر الإعلان'}</button>
          <button className="btn btn-ghost" onClick={() => setModal(null)}>إلغاء</button>
        </>}>
        <Field label="نص الإعلان" hint="يكتب التلميذ هذه الرسالة في قسم إعلانات المدرسة">
          <textarea className="input" rows={3} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
        </Field>
        <Field label="صور الإعلان" hint="يمكن رفع عدة صور، وتُعرض كبيرة في الصفحة الرئيسية">
          <input className="input" type="file" accept="image/*" multiple
                 onChange={e => setForm(f => ({ ...f, files: [...f.files, ...Array.from(e.target.files || [])] }))} />
        </Field>
        {(form.images.length > 0 || form.files.length > 0) && (
          <div className="ann-thumbs" style={{ gap: 10 }}>
            {form.images.map((img, i) => (
              <div key={i} className="ann-thumb">
                <img src={img} alt="" />
                <button type="button" className="ann-thumb-del" onClick={() => removeExisting(img)} title="إزالة">✕</button>
              </div>
            ))}
            {form.files.map((f, i) => (
              <div key={'n' + i} className="ann-thumb">
                <img src={URL.createObjectURL(f)} alt="" />
                <button type="button" className="ann-thumb-del" onClick={() => setForm(x => ({ ...x, files: x.files.filter((_, j) => j !== i) }))} title="إزالة">✕</button>
              </div>
            ))}
          </div>
        )}
        <Field label="الحالة">
          <select className="select" value={form.status} onChange={e => setForm({ ...form, status: Number(e.target.value) })}>
            <option value={1}>منشور (يظهر للتلاميذ)</option>
            <option value={0}>مخفي</option>
          </select>
        </Field>
      </Modal>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="حذف الإعلان"
        footer={<>
          <button className="btn btn-danger" onClick={del} disabled={busy}>{busy ? '...' : 'نعم، احذف'}</button>
          <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>إلغاء</button>
        </>}>
        <p>هل أنت متأكد من حذف هذا الإعلان نهائياً؟ سيختفي من الصفحة الرئيسية فوراً.</p>
      </Modal>
    </div>
  );
}