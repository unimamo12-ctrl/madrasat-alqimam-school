import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../../lib/api';
import StudentLayout from '../../components/StudentLayout';
import { Loading, Empty, ErrorState, Badge, ConfirmDialog } from '../../components/ui';
import { useToast } from '../../components/Toast';

function MembersList({ groupId, label, count }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (rows === null) {
      apiGet(`/student/groups/${groupId}/members`)
        .then(d => setRows(d.students))
        .catch(() => setRows([]));
    }
  }

  return (
    <div className="grp-members">
      <button type="button" className="grp-members-btn" onClick={toggle} aria-expanded={open}>
        <span>{label}{count != null ? ` (${count})` : ''}</span>
        <span className={`grp-caret ${open ? 'up' : ''}`}>▾</span>
      </button>
      {open && (
        rows === null ? <Loading />
        : rows.length === 0 ? (
          <p className="grp-empty-small">لا يوجد تلاميذ في هذا الفوج بعد — كن أول من يختاره!</p>
        ) : (
          <div className="grp-list">
            {rows.map((s, i) => (
              <div key={i} className="grp-list-row">
                <span>{i + 1}. {s.first_name} {s.last_name}</span>
                <span className="grp-reg">{s.reg_number}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export default function TeacherDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setState(s => ({ ...s, loading: true, error: null }));
    apiGet(`/student/teachers/${id}`)
      .then(data => setState({ loading: false, error: null, data }))
      .catch(err => setState(s => ({ ...s, loading: false, error: err.message })));
  }, [id]);

  useEffect(reload, [reload]);

  async function confirmSelection() {
    if (!confirm) return;
    setBusy(true);
    try {
      await apiPost(`/student/groups/${confirm.id}/select`, {});
      toast.success('تم تأكيد اختيارك بنجاح.');
      setConfirm(null);
      reload();
    } catch (err) {
      toast.error(err.message);
      setTimeout(reload, 400);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) {
    return <StudentLayout> <div className="page"><Loading /></div> </StudentLayout>;
  }
  if (state.error) {
    return <StudentLayout> <div className="page"><ErrorState message={state.error} onRetry={reload} /></div> </StudentLayout>;
  }

  const { teacher, groups, my_selection } = state.data;
  const daysOrder = ['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'];
  const sorted = [...groups].sort((a, b) =>
    daysOrder.indexOf(a.day) - daysOrder.indexOf(b.day) || a.start_time.localeCompare(b.start_time)
  );

  const membersOf = g => (
    <MembersList
      groupId={g.id}
      label={g.is_mine ? 'تلاميذ فوجي' : 'من اختار هذا الفوج؟'}
      count={g.occupied}
    />
  );

  return (
    <StudentLayout>
      <div className="page">
        <div className="container">
          <div className="t-detail-head">
            <div className="big-photo">
              {teacher.photo ? <img src={teacher.photo} alt={`${teacher.first_name} ${teacher.last_name}`} /> : <span style={{ fontSize: 36, fontWeight: 900, color: '#1d4ed8' }}>{teacher.first_name?.charAt(0)}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h2>الأستاذ {teacher.first_name} {teacher.last_name}</h2>
              <div className="meta">المادة: {teacher.subject_name}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>→ الرجوع</button>
          </div>

          {my_selection ? (
            <>
              <div className="card" style={{ padding: 20, borderColor: '#86efac', background: '#f0fdf4', marginBottom: 18 }}>
                <div className="flex between wrap">
                  <div>
                    <div className="flex" style={{ gap: 8, marginBottom: 6 }}>
                      <Badge kind="green">اختيارك مؤكد لحظة</Badge>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>
                      {my_selection.group_name} — {my_selection.day} {my_selection.start_time} - {my_selection.end_time}
                    </div>
                  </div>
                </div>
                <div className="mt-12">
                  <MembersList groupId={my_selection.group_id} label="تلاميذ فوجي" count={null} />
                </div>
              </div>

              <div className="section" style={{ marginTop: 18 }}>
                <h3 className="mb-12" style={{ fontSize: 16 }}>أفواج {teacher.first_name} {teacher.last_name}</h3>
                <div className="small text-muted" style={{ marginBottom: 12, fontWeight: 600 }}>لقد قمت باختيار فوج لهذا الأستاذ مسبقاً.</div>
                {sorted.map(g => (
                  <div key={g.id} className={`group-card ${g.is_mine ? 'my' : ''}`}>
                    <div className="flex between wrap" style={{ width: '100%' }}>
                      <div>
                        <div className="gname">{g.name} {g.is_mine && <Badge kind="green">فوجي</Badge>}</div>
                        <div className="gmeta">{g.day} · {g.start_time} - {g.end_time} · {g.occupied}/{g.capacity} مقعداً</div>
                      </div>
                      <button className="btn btn-ghost btn-sm" disabled onClick={() => toast.warn('لا يمكن تغيير الاختيار بعد التأكيد. يرجى التواصل مع الإدارة.')}>
                        اختيار الفوج
                      </button>
                    </div>
                    {membersOf(g)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h3 className="mb-12" style={{ fontSize: 16 }}>اختر فوجك الدراسي</h3>
              {sorted.length === 0 ? (
                <Empty icon="📅" title="لا توجد أفواج متاحة لهذا الأستاذ." hint="ستظهر الأفواج عند فتح التسجيل من طرف الإدارة." />
              ) : (
                sorted.map(g => (
                  <div key={g.id} className={`group-card ${g.full ? 'full' : ''}`}>
                    <div className="flex between wrap" style={{ width: '100%' }}>
                      <div>
                        <div className="gname">{g.name}</div>
                        <div className="gmeta">{g.day} · {g.start_time} - {g.end_time} · {g.occupied}/{g.capacity} مقعداً</div>
                      </div>
                      {g.full ? (
                        <Badge kind="red">الفوج مكتمل</Badge>
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={() => setConfirm(g)}>
                          اختيار هذا الفوج
                        </button>
                      )}
                    </div>
                    {membersOf(g)}
                  </div>
                ))
              )}
            </>
          )}

          <ConfirmDialog
            open={!!confirm}
            onClose={() => setConfirm(null)}
            onConfirm={confirmSelection}
            confirmBusy={busy}
            title="تأكيد اختيار الفوج"
            message={confirm ? `هل أنت متأكد من اختيار ${confirm.name}؟` : ''}
          />
        </div>
      </div>
    </StudentLayout>
  );
}