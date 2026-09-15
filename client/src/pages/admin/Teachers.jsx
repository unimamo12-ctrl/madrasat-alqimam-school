import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete, apiPatch, uploadPost, uploadPut } from '../../lib/api';
import { Loading, Empty, ErrorState, Modal, Field, StatusBadge, Pill, Avatar, Badge } from '../../components/ui';
import { useToast } from '../../components/Toast';

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const EMPTY = { id: null, first_name: '', last_name: '', subject_id: '', status: 1, levels: [], classes: [], photoFile: null };

function defaultGroupRow(levelId) {
  return { name: '', level_id: levelId || '', class_id: '', day: 'الجمعة', start_time: '08:00', end_time: '10:00', capacity: 15, status: 1 };
}

export default function AdminTeachers() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [options, setOptions] = useState({ levels: [], classes: [], subjects: [] });
  const [filters, setFilters] = useState({ q: '', subject_id: '', level_id: '' });
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [groupRows, setGroupRows] = useState([]);
  const [teacherGroups, setTeacherGroups] = useState([]);
  const [removedExisting, setRemovedExisting] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([apiGet('/admin/teachers', filters), apiGet('/admin/settings/options')]);
      setRows(t.teachers);
      setOptions({ levels: o.levels, classes: o.classes, subjects: o.subjects });
    } catch (e) { toast.error(e.message); }
  }, [filters, toast]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setForm({ ...EMPTY, subject_id: options.subjects[0]?.id || '' });
    setTeacherGroups([]);
    setRemovedExisting([]);
    setGroupRows([defaultGroupRow(options.levels[0]?.id)]);
    setModal('edit');
  }

  async function openEdit(t) {
    setForm({
      id: t.id, first_name: t.first_name, last_name: t.last_name, subject_id: t.subject_id, status: t.status,
      levels: t.levels.map(x => x.id), classes: t.classes.map(x => x.id), photoFile: null, oldPhoto: t.photo
    });
    setGroupRows([]);
    setRemovedExisting([]);
    setTeacherGroups([]);
    setModal('edit');
    try {
      const g = await apiGet('/admin/groups', { teacher_id: t.id });
      setTeacherGroups(g.groups);
    } catch (e) { toast.error(e.message); }
  }

  function togglePill(which, id) {
    const cur = form[which];
    setForm({ ...form, [which]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  }

  const classesForLevels = options.classes.filter(c => form.levels.includes(c.level_id));

  function addGroupRow() {
    setGroupRows(rs => [...rs, defaultGroupRow(form.levels[0]?.id)]);
  }

  function updateGroupRow(idx, patch) {
    setGroupRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function removeGroupRow(idx) {
    setGroupRows(rs => rs.filter((_, i) => i !== idx));
  }

  function removeExistingGroup(g) {
    setTeacherGroups(gs => gs.filter(x => x.id !== g.id));
    setRemovedExisting(ids => [...ids, g.id]);
  }

  function validateGroupRows(pending) {
    for (const r of pending) {
      if (!String(r.name).trim()) { toast.error('اكتب اسم الفوج قبل الحفظ.'); return false; }
      if (!r.level_id) { toast.error('حدد مستوى كل فوج.'); return false; }
      if (!DAYS.includes(r.day) || !r.start_time || !r.end_time) { toast.error('حدد اليوم ووقت بداية ونهاية كل فوج.'); return false; }
      if (!r.capacity || Number(r.capacity) < 1) { toast.error('عدد مقاعد كل فوج يجب أن يكون 1 على الأقل.'); return false; }
    }
    return true;
  }

  async function save() {
    if (!form.first_name.trim() || !form.last_name.trim()) { toast.error('الاسم واللقب مطلوبان.'); return; }
    if (!form.subject_id) { toast.error('اختر المادة.'); return; }
    if (!form.levels.length) { toast.error('حدد المستويات التي يدرسها الأستاذ.'); return; }
    if (!form.classes.length) { toast.error('حدد الشعب التي يدرسها الأستاذ.'); return; }

    const pending = groupRows.filter(r => String(r.name).trim());
    if (pending.length && !validateGroupRows(pending)) return;

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('first_name', form.first_name);
      fd.append('last_name', form.last_name);
      fd.append('subject_id', form.subject_id);
      fd.append('status', form.status);
      fd.append('levels', JSON.stringify(form.levels));
      fd.append('classes', JSON.stringify(form.classes));
      if (form.photoFile) fd.append('photo', form.photoFile);

      let teacherId = form.id;
      if (form.id) { await uploadPut(`/admin/teachers/${form.id}`, fd); toast.success('تم تحديث الأستاذ.'); }
      else { const r = await uploadPost('/admin/teachers', fd); teacherId = r.id; toast.success('تمت إضافة الأستاذ.'); }

      for (const g of pending) {
        await apiPost('/admin/groups', { teacher_id: teacherId, ...g });
      }
      let removed = 0;
      for (const gid of removedExisting) {
        try { await apiDelete(`/admin/groups/${gid}`); removed++; }
        catch (e) { toast.error(e.message); }
      }
      if (pending.length || removed) toast.success('تم حفظ الأفواج مع الأستاذ.');
      setModal(null); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function toggleStatus(t) {
    try { await apiPatch(`/admin/teachers/${t.id}/status`, { status: t.status ? 0 : 1 }); toast.success('تم التحديث.'); load(); }
    catch (e) { toast.error(e.message); }
  }

  async function del() {
    setBusy(true);
    try { await apiDelete(`/admin/teachers/${confirmDel.id}`); toast.success('تم حذف الأستاذ.'); setConfirmDel(null); load(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  const classesFor = levelId => options.classes.filter(c => String(c.level_id) === String(levelId));

  return (
    <div>
      <div className="page-header">
        <h1>إدارة الأساتذة</h1>
        <p className="sub">إضافة الأساتذة مع الصور والمستويات والشعب، وإنشاء أفواجهم مع اليوم والوقت عند الحفظ</p>
      </div>

      <div className="filterbar">
        <div className="search-box">
          <span className="sico">🔍</span>
          <input className="input" placeholder="بحث باسم الأستاذ..." value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <select className="select" value={filters.subject_id} onChange={e => setFilters({ ...filters, subject_id: e.target.value })}>
          <option value="">كل المواد</option>
          {options.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="select" value={filters.level_id} onChange={e => setFilters({ ...filters, level_id: e.target.value })}>
          <option value="">كل المستويات</option>
          {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ إضافة أستاذ</button>
      </div>

      {rows === null ? <Loading /> : rows.length === 0 ? (
        <Empty icon="👨‍🏫" title="لا يوجد أساتذة" hint="أضف أستاذاً وحدد أفواجه مع اليوم والوقت." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th></th><th>الاسم الكامل</th><th>المادة</th><th>يدرّس المستويات</th><th>الشعب</th><th>أفواج</th><th>الحالة</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td><Avatar firstName={t.first_name} lastName={t.last_name} photo={t.photo} size={38} /></td>
                  <td style={{ fontWeight: 800 }}>{t.first_name} {t.last_name}</td>
                  <td>{t.subject_name}</td>
                  <td className="small">{t.levels.map(l => l.name).join('، ')}</td>
                  <td className="small">{t.classes.map(c => c.name).join('، ')}</td>
                  <td>
                    <Badge kind={t.groups_count > 0 ? 'blue' : 'gray'}>{t.groups_count}</Badge>
                  </td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>تعديل</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(t)}>{t.status ? 'تعطيل' : 'تفعيل'}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(t)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title={form.id ? 'تعديل أستاذ' : 'إضافة أستاذ جديد'} wide
        footer={<>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '...جاري الرفع' : 'حفظ'}</button>
          <button className="btn btn-ghost" onClick={() => setModal(null)}>إلغاء</button>
        </>}>
        <div className="flex mb-12" style={{ gap: 16, alignItems: 'center' }}>
          {form.photoFile
            ? <img src={URL.createObjectURL(form.photoFile)} alt="معاينة" style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover' }} />
            : <Avatar firstName={form.first_name} lastName={form.last_name} photo={form.oldPhoto} size={80} />}
          <div>
            <p className="small text-muted mb-8">صورة الأستاذ (JPG/PNG حتى 3MB)</p>
            <input type="file" accept="image/*" onChange={e => setForm({ ...form, photoFile: e.target.files[0] || null })} />
          </div>
        </div>
        <div className="grid-2">
          <Field label="الاسم *"><input className="input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></Field>
          <Field label="اللقب *"><input className="input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></Field>
        </div>
        <Field label="المادة *">
          <select className="select" value={form.subject_id} onChange={e => setForm({ ...form, subject_id: e.target.value })}>
            {options.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="المستويات التي يدرسها *">
          <div className="pill-group">
            {options.levels.map(l => <Pill key={l.id} label={l.name} on={form.levels.includes(l.id)} onClick={() => togglePill('levels', l.id)} />)}
          </div>
        </Field>
        <Field label="الشعب التي يدرسها *">
          <div className="pill-group">
            {classesForLevels.map(c => <Pill key={c.id} label={c.name} on={form.classes.includes(c.id)} onClick={() => togglePill('classes', c.id)} />)}
          </div>
        </Field>
        <Field label="الحالة">
          <select className="select" value={form.status} onChange={e => setForm({ ...form, status: Number(e.target.value) })}>
            <option value={1}>فعال</option>
            <option value={0}>غير فعال</option>
          </select>
        </Field>

        <div className="card" style={{ padding: 18, marginTop: 6, background: '#f8fafc' }}>
          <div className="flex between wrap" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 800, color: '#172554' }}>أفواج الأستاذ</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addGroupRow}>+ إضافة فوج</button>
          </div>
          {!form.id && groupRows.length === 0 && (
            <p className="small text-muted" style={{ fontWeight: 600 }}>اضغط «+ إضافة فوج» لإضافة فوج مع وقت الحصة لهذا الأستاذ.</p>
          )}

          {teacherGroups.length > 0 && (
            <>
              <div className="small mb-8" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>أفواج الأستاذ الحالية — احذفها أو عدّل أوقاتها، ثم احفظ:</div>
              {teacherGroups.map(g => (
                <div key={g.id} className="flex between wrap" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', marginBottom: 8 }}>
                  <div>
                    <b>{g.name}</b>
                    <span className="text-muted small"> · {g.day} {g.start_time}-{g.end_time} · {g.occupied}/{g.capacity} مقعداً · {g.level_name}{g.class_name ? ' / ' + g.class_name : ''}</span>
                  </div>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeExistingGroup(g)}>حذف</button>
                </div>
              ))}
            </>
          )}

          <div className="small mb-8" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>
            {form.id ? 'أفواج جديدة تُنشأ مع حفظ التعديل:' : 'أفواج تُنشأ تلقائياً مع إضافة الأستاذ:'}
          </div>
          {groupRows.map((r, idx) => (
            <div key={idx} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginBottom: 10, background: '#fff' }}>
              <div className="flex between" style={{ marginBottom: 10 }}>
                <b className="small" style={{ color: 'var(--ink-2)' }}>الفوج #{idx + 1}</b>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeGroupRow(idx)}>إزالة</button>
              </div>
              <div className="grid-2" style={{ marginBottom: 10 }}>
                <Field label="اسم الفوج *"><input className="input" value={r.name} onChange={e => updateGroupRow(idx, { name: e.target.value })} placeholder="مثال: الفوج 1" /></Field>
                <Field label="المستوى *">
                  <select className="select" value={r.level_id} onChange={e => updateGroupRow(idx, { level_id: e.target.value, class_id: '' })}>
                    <option value="">اختر المستوى...</option>
                    {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid-2" style={{ marginBottom: 10 }}>
                <Field label="الشعبة">
                  <select className="select" value={r.class_id} onChange={e => updateGroupRow(idx, { class_id: e.target.value })} disabled={!r.level_id}>
                    <option value="">—</option>
                    {classesFor(r.level_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="اليوم *">
                  <select className="select" value={r.day} onChange={e => updateGroupRow(idx, { day: e.target.value })}>
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid-3">
                <Field label="وقت البداية *"><input type="time" className="input" value={r.start_time} onChange={e => updateGroupRow(idx, { start_time: e.target.value })} /></Field>
                <Field label="وقت النهاية *"><input type="time" className="input" value={r.end_time} onChange={e => updateGroupRow(idx, { end_time: e.target.value })} /></Field>
                <Field label="عدد المقاعد *"><input type="number" min="1" className="input" value={r.capacity} onChange={e => updateGroupRow(idx, { capacity: Number(e.target.value) })} /></Field>
              </div>
              <Field label="حالة الفوج">
                <select className="select" value={r.status} onChange={e => updateGroupRow(idx, { status: Number(e.target.value) })}>
                  <option value={1}>مفتوح</option>
                  <option value={0}>مغلق</option>
                </select>
              </Field>
            </div>
          ))}
          {groupRows.length === 0 && !form.id && (
            <p className="small text-muted" style={{ fontWeight: 600 }}>اضغط «+ إضافة فوج» لإضافة فوج مع وقت الحصة لهذا الأستاذ.</p>
          )}
        </div>
      </Modal>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="حذف الأستاذ"
        footer={<>
          <button className="btn btn-danger" onClick={del} disabled={busy}>{busy ? '...' : 'نعم، احذف'}</button>
          <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>إلغاء</button>
        </>}>
        <p>هل أنت متأكد من حذف <b>{confirmDel?.first_name} {confirmDel?.last_name}</b>؟</p>
      </Modal>
    </div>
  );
}