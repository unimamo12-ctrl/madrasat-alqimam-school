import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import { Loading, Empty, Avatar, Badge } from '../../components/ui';
import { useToast } from '../../components/Toast';

export default function AdminTeacherChoices() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await apiGet('/admin/teacher-choices', { q: q.trim() || undefined });
      setData(r);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }, [q, toast]);

  useEffect(() => { load(); }, [load, tick]);

  const totalChoosers = data ? data.teachers.reduce((sum, t) => sum + t.total, 0) : 0;

  return (
    <div>
      <div className="page-header">
        <h1>اختيارات التلاميذ للأساتذة</h1>
        <p className="sub">
          تقرير إداري: جميع الأساتذة مع التلاميذ الذين اختاروهم{data?.year ? ` — السنة الدراسية: ${data.year.name}` : ''}
        </p>
      </div>

      <div className="filterbar">
        <div className="search-box">
          <span className="sico">🔍</span>
          <input className="input" placeholder="بحث باسم الأستاذ..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setTick(t => t + 1)} disabled={busy}>🔄 تحديث</button>
      </div>

      {data === null ? <Loading /> : data.teachers.length === 0 ? (
        <Empty icon="👨‍🏫" title="لا يوجد أساتذة" hint={q ? 'جرب تساؤلاً آخر في البحث.' : 'أضف أساتذة أولاً من صفحة «الأساتذة».'} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {data.teachers.map(t => {
            const has = t.total > 0;
            return (
              <div key={t.id} className="card" style={{ padding: 16 }}>
                <div className="flex between wrap" style={{ gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <div className="flex" style={{ gap: 12, alignItems: 'center', flex: '1 1 auto', minWidth: 0 }}>
                    <Avatar firstName={t.first_name} lastName={t.last_name} photo={t.photo} size={56} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.first_name} {t.last_name}
                      </div>
                      <div className="small text-muted">{t.subject_name}</div>
                    </div>
                  </div>
                  <Badge kind={has ? 'green' : 'gray'}>{t.total} تلميذ</Badge>
                </div>
                <div style={{ borderTop: '1px solid var(--line)', marginBottom: 12 }} />
                {has ? (
                  <ol style={{ margin: 0, paddingInlineStart: 20 }}>
                    {t.students.map(s => (
                      <li key={s.id} className="small" style={{ margin: '6px 0' }}>
                        <b>{s.first_name} {s.last_name}</b>{' '}
                        <span className="text-muted mono">({s.reg_number})</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="small text-muted" style={{ margin: 0 }}>لم يختره أي تلميذ حاليًا.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && data.teachers.length > 0 && (
        <p className="small text-muted mt-18" style={{ fontWeight: 600 }}>
          المجموع: {data.teachers.length} أستاذ · {totalChoosers} اختيار في السنة الدراسية الحالية
        </p>
      )}
    </div>
  );
}