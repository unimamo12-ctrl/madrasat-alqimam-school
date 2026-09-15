import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPut, apiDelete, apiPost } from '../../lib/api';
import { Loading, Empty, Modal, Badge } from '../../components/ui';
import { useToast } from '../../components/Toast';

export default function AdminSelections() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [options, setOptions] = useState({ levels: [], classes: [] });
  const [filters, setFilters] = useState({ q: '', teacher_id: '', level_id: '', group_id: '' });
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveForm, setMoveForm] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([apiGet('/admin/selections', filters), apiGet('/admin/settings/options')]);
      setRows(s.selections);
      setOptions({ levels: o.levels, classes: o.classes });
    } catch (e) { toast.error(e.message); }
  }, [filters, toast]);

  useEffect(() => { load(); }, [load]);

  // نحمل أفواج الأستاذ الهدف عند عملية النقل عبر /admin/groups
  const [teacherGroupList, setTeacherGroupList] = useState([]);

  async function loadTeacherGroups(teacherId) {
    if (!teacherId) { setTeacherGroupList([]); return; }
    try {
      const g = await apiGet('/admin/groups', { teacher_id: teacherId });
      setTeacherGroupList(g.groups.filter(x => x.status === 1));
    } catch (e) { toast.error(e.message); }
  }

  async function doMove() {
    if (!moveForm) { toast.error('اختر الفوج الجديد.'); return; }
    setBusy(true);
    try {
      await apiPut(`/admin/selections/${moveTarget.selection_id}/move`, { group_id: Number(moveForm) });
      toast.success('تم نقل التلميذ إلى الفوج الجديد وتحديث حسابه تلقائياً.');
      setMoveTarget(null); setMoveForm(''); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function del() {
    setBusy(true);
    try {
      await apiDelete(`/admin/selections/${confirmDel.selection_id}`);
      toast.success('تم حذف الاختيار. التلميذ أصبح حراً في إعادة الاختيار.');
      setConfirmDel(null); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function reopen() {
    setBusy(true);
    try {
      await apiPost(`/admin/selections/${confirmDel.selection_id}/reopen`, {});
      toast.success('تمت إعادة فتح الاختيار للتلميذ.');
      setConfirmDel(null); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <h1>اختيارات التلاميذ</h1>
        <p className="sub">متابعة جميع اختيارات الأفواج وتعديلها بصلاحية الإدارة</p>
      </div>

      <div className="filterbar">
        <div className="search-box">
          <span className="sico">🔍</span>
          <input className="input" placeholder="بحث: تلميذ، أستاذ، رقم تسجيل، فوج..." value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <select className="select" value={filters.level_id} onChange={e => setFilters({ ...filters, level_id: e.target.value })}>
          <option value="">كل المستويات</option>
          {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {rows === null ? <Loading /> : rows.length === 0 ? (
        <Empty icon="✅" title="لا توجد اختيارات بعد" hint="ستظهر هنا اختيارات التلاميذ بمجرد تأكيدهم." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>التلميذ</th><th>المستوى</th><th>الأستاذ</th><th>المادة</th><th>الفوج</th><th>اليوم / الوقت</th><th>الحالة</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.selection_id}>
                  <td style={{ fontWeight: 800 }}>{r.sfirst} {r.slast} <span className="small text-muted mono">({r.reg_number})</span></td>
                  <td className="small">{r.level_name}{r.class_name ? ` / ${r.class_name}` : ''}</td>
                  <td>{r.tfirst} {r.tlast}</td>
                  <td>{r.subject_name}</td>
                  <td><Badge kind="blue">{r.group_name}</Badge></td>
                  <td>{r.day} · {r.start_time}-{r.end_time}</td>
                  <td><Badge kind={r.sel_status === 'confirmed' ? 'green' : 'gray'}>{r.sel_status === 'confirmed' ? 'مؤكد' : r.sel_status}</Badge></td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setMoveTarget(r); setMoveForm(''); loadTeacherGroups(r.teacher_id); }}>نقل</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel({ ...r, mode: 'reopen' })}>إعادة فتح</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel({ ...r, mode: 'del' })}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!moveTarget} onClose={() => setMoveTarget(null)} title={`نقل التلميذ ${moveTarget?.sfirst} ${moveTarget?.slast}`}
        footer={<>
          <button className="btn btn-primary" onClick={doMove} disabled={busy}>{busy ? '...' : 'نقل الآن'}</button>
          <button className="btn btn-ghost" onClick={() => setMoveTarget(null)}>إلغاء</button>
        </>}>
        <p className="mb-12 small text-muted" style={{ fontWeight: 700 }}>
          الفوج الحالي: {moveTarget?.group_name} — {moveTarget?.day} {moveTarget?.start_time}. الإدارة فقط يمكنها النقل.
        </p>
        <select className="select" value={moveForm} onChange={e => setMoveForm(e.target.value)}>
          <option value="">اختر الفوج الجديد ({moveTarget?.tfirst} {moveTarget?.tlast})...</option>
          {teacherGroupList.map(g => (
            <option key={g.id} value={g.id} disabled={g.id === moveTarget?.group_id}>
              {g.name} — {g.day} {g.start_time}-{g.end_time} ({g.occupied}/{g.capacity})
            </option>
          ))}
        </select>
        <p className="small text-muted mt-8">يجب اختيار فوج بنفس الأستاذ ويطابق مستوى التلميذ.</p>
      </Modal>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title={confirmDel?.mode === 'del' ? 'حذف الاختيار' : 'إعادة فتح الاختيار'}
        footer={<>
          {confirmDel?.mode === 'del'
            ? <button className="btn btn-danger" onClick={del} disabled={busy}>{busy ? '...' : 'نعم، احذف'}</button>
            : <button className="btn btn-accent" onClick={reopen} disabled={busy}>{busy ? '...' : 'إعادة الفتح'}</button>}
          <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>إلغاء</button>
        </>}>
        {confirmDel?.mode === 'del'
          ? <p>سيتم حذف اختيار <b>{confirmDel?.sfirst} {confirmDel?.slast}</b> من فوج <b>{confirmDel?.group_name}</b> نهائياً.</p>
          : <p>سيتم حذف الاختيار ليعيد التلميذ <b>{confirmDel?.sfirst} {confirmDel?.slast}</b> اختيار فوج جديد بنفسه.</p>}
      </Modal>
    </div>
  );
}