import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
import { Loading, Empty, Modal, Field, StatusBadge, Badge } from '../../components/ui';
import { useToast } from '../../components/Toast';

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const EMPTY = { id: null, name: '', teacher_id: '', level_id: '', class_id: '', day: 'الجمعة', start_time: '08:00', end_time: '10:00', capacity: 15, status: 1 };

export default function AdminGroups() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [options, setOptions] = useState({ levels: [], classes: [], teachers: [] });
  const [teachersByLevel, setTeachersByLevel] = useState([]);
  const [filters, setFilters] = useState({ teacher_id: '', level_id: '' });
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [members, setMembers] = useState(null);

  const load = useCallback(async () => {
    try {
      const [g, o] = await Promise.all([apiGet('/admin/groups', filters), apiGet('/admin/settings/options')]);
      setRows(g.groups);
      setOptions({ levels: o.levels, classes: o.classes, teachers: o.teachers });
    } catch (e) { toast.error(e.message); }
  }, [filters, toast]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setForm({ ...EMPTY, teacher_id: options.teachers[0]?.id || '', level_id: options.levels[0]?.id || '', class_id: '' });
    setModal('edit');
  }
  function openEdit(g) {
    setForm({ id: g.id, name: g.name, teacher_id: g.teacher_id, level_id: g.level_id, class_id: g.class_id || '', day: g.day, start_time: g.start_time, end_time: g.end_time, capacity: g.capacity, status: g.status });
    setModal('edit');
  }

  async function save() {
    if (!form.name.trim() || !form.teacher_id || !form.level_id || !DAYS.includes(form.day) || !form.start_time || !form.end_time) {
      toast.error('يرجى ملء جميع الحقول: الاسم، الأستاذ، المستوى، اليوم والوقت.');
      return;
    }
    if (!form.capacity || Number(form.capacity) < 1) { toast.error('عدد المقاعد يجب أن يكون 1 على الأقل.'); return; }
    setBusy(true);
    try {
      if (form.id) { await apiPut(`/admin/groups/${form.id}`, form); toast.success('تم تحديث الفوج.'); }
      else { await apiPost('/admin/groups', form); toast.success('تم إنشاء الفوج.'); }
      setModal(null); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function del() {
    setBusy(true);
    try { await apiDelete(`/admin/groups/${confirmDel.id}`); toast.success('تم حذف الفوج.'); setConfirmDel(null); load(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function showMembers(g) {
    setMembers({ group: g, students: null });
    try {
      const d = await apiGet(`/admin/groups/${g.id}/students`);
      setMembers({ group: g, students: d.students });
    } catch (e) { toast.error(e.message); }
  }

  const classesFor = options.classes.filter(c => String(c.level_id) === String(form.level_id));

  return (
    <div>
      <div className="page-header">
        <h1>الأفواج</h1>
        <p className="sub">إنشاء وتعديل أفواج الأساتذة، الأيام، الأوقات، المقاعد والحالة</p>
      </div>

      <div className="filterbar">
        <select className="select" value={filters.teacher_id} onChange={e => setFilters({ ...filters, teacher_id: e.target.value })}>
          <option value="">كل الأساتذة</option>
          {options.teachers.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
        </select>
        <select className="select" value={filters.level_id} onChange={e => setFilters({ ...filters, level_id: e.target.value })}>
          <option value="">كل المستويات</option>
          {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ إنشاء فوج</button>
      </div>

      {rows === null ? <Loading /> : rows.length === 0 ? (
        <Empty icon="🗂️" title="لا توجد أفواج" hint="أنشئ أول فوج بحضور أستاذ ومستوى." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>الفوج</th><th>الأستاذ</th><th>المادة</th><th>المستوى</th><th>الشعبة</th><th>اليوم / الوقت</th><th>المقاعد</th><th>الحالة</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {rows.map(g => (
                <tr key={g.id}>
                  <td style={{ fontWeight: 800 }}>{g.name}</td>
                  <td>{g.tfirst} {g.tlast}</td>
                  <td>{g.subject_name}</td>
                  <td>{g.level_name}</td>
                  <td>{g.class_name || '—'}</td>
                  <td>{g.day} · {g.start_time}-{g.end_time}</td>
                  <td>
                    <Badge kind={g.occupied >= g.capacity ? 'red' : 'blue'}>{g.occupied}/{g.capacity}</Badge>
                  </td>
                  <td><StatusBadge status={g.status} /></td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => showMembers(g)}>التلاميذ</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(g)}>تعديل</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(g)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title={form.id ? 'تعديل الفوج' : 'إنشاء فوج جديد'} wide
        footer={<>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '...' : 'حفظ'}</button>
          <button className="btn btn-ghost" onClick={() => setModal(null)}>إلغاء</button>
        </>}>
        <Field label="اسم الفوج *"><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: الفوج 1" /></Field>
        <div className="grid-2">
          <Field label="الأستاذ *">
            <select className="select" value={form.teacher_id} onChange={e => setForm({ ...form, teacher_id: e.target.value })}>
              <option value="">اختر الأستاذ...</option>
              {options.teachers.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
            </select>
          </Field>
          <Field label="المستوى *">
            <select className="select" value={form.level_id} onChange={e => setForm({ ...form, level_id: e.target.value, class_id: '' })}>
              <option value="">اختر المستوى...</option>
              {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid-2">
          <Field label="الشعبة">
            <select className="select" value={form.class_id} onChange={e => setForm({ ...form, class_id: e.target.value })} disabled={!form.level_id}>
              <option value="">—</option>
              {classesFor.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="اليوم *">
            <select className="select" value={form.day} onChange={e => setForm({ ...form, day: e.target.value })}>
              {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid-3">
          <Field label="وقت البداية *"><input type="time" className="input" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></Field>
          <Field label="وقت النهاية *"><input type="time" className="input" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></Field>
          <Field label="عدد المقاعد *"><input type="number" min="1" className="input" value={form.capacity} onChange={e => setForm({ ...form, capacity: Number(e.target.value) })} /></Field>
        </div>
        <Field label="حالة الفوج">
          <select className="select" value={form.status} onChange={e => setForm({ ...form, status: Number(e.target.value) })}>
            <option value={1}>مفتوح</option>
            <option value={0}>مغلق</option>
          </select>
        </Field>
      </Modal>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="حذف الفوج"
        footer={<>
          <button className="btn btn-danger" onClick={del} disabled={busy}>{busy ? '...' : 'نعم، احذف'}</button>
          <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>إلغاء</button>
        </>}>
        <p>هل أنت متأكد من حذف فوج <b>{confirmDel?.name}</b>؟</p>
      </Modal>

      <Modal open={!!members} onClose={() => setMembers(null)} title={members ? `تلاميذ ${members.group.name}` : ''}>
        {!members || members.students === null ? <Loading /> : members.students.length === 0 ? (
          <Empty icon="👥" title="لا يوجد تلاميذ في هذا الفوج" />
        ) : (
          <div className="table-wrap">
            <table style={{ minWidth: 0 }}>
              <thead><tr><th>#</th><th>الاسم الكامل</th><th>رقم التسجيل</th></tr></thead>
              <tbody>
                {members.students.map((s, i) => (
                  <tr key={s.reg_number}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 800 }}>{s.first_name} {s.last_name}</td>
                    <td className="mono">{s.reg_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}