import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../lib/api';
import { Loading, ErrorState } from '../../components/ui';

export default function Dashboard() {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    apiGet('/admin/stats')
      .then(data => setState({ loading: false, error: null, data }))
      .catch(err => setState(s => ({ ...s, loading: false, error: err.message })));
  }, []);

  if (state.loading) return <Loading />;
  if (state.error) return <ErrorState message={state.error} onRetry={() => window.location.reload()} />;

  const { stats, monthlyChart, levelChart, groupCapacity } = state.data;
  const maxMonthly = Math.max(...monthlyChart.map(m => m.paid), 1);
  const maxLevel = Math.max(...levelChart.map(l => l.count), 1);

  const cards = [
    { icon: '🎓', color: '#eff6ff', num: stats.students, label: 'عدد التلاميذ' },
    { icon: '👨‍🏫', color: '#ecfeff', num: stats.teachers, label: 'عدد الأساتذة' },
    { icon: '🗂️', color: '#fef3c7', num: stats.groups, label: 'عدد الأفواج' },
    { icon: '✅', color: '#dcfce7', num: stats.selections, label: 'عدد الاختيارات' },
    { icon: '⏳', color: '#fff7ed', num: stats.studentsWithoutSelection, label: 'تلاميذ لم يختاروا بعد' },
    { icon: '💳', color: '#dcfce7', num: stats.studentsRod, label: 'تلاميذ مسددون' },
    { icon: '⛔', color: '#fee2e2', num: stats.studentsNotPaid, label: 'تلاميذ غير مسددين' }
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="sub">نظرة عامة على نظام مدرسة القمم النجاح</p>
      </div>

      <div className="stat-grid">
        {cards.map((c, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: c.color }}>{c.icon}</div>
            <div>
              <div className="num">{c.num}</div>
              <div className="lbl">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="chart-row" style={{ display: 'grid' }}>
        <div className="chart-card">
          <h3>الدفع الشهري (تلاميذ سددوا)</h3>
          {monthlyChart.map(m => (
            <div key={m.month} className="bar-row">
              <span className="bar-label">{m.month}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(m.paid / maxMonthly) * 100}%` }} /></div>
              <span className="bar-value">{m.paid}</span>
            </div>
          ))}
        </div>
        <div className="chart-card">
          <h3>توزيع التلاميذ حسب المستوى</h3>
          {levelChart.map(l => (
            <div key={l.name} className="bar-row">
              <span className="bar-label">{l.name}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(l.count / maxLevel) * 100}%`, background: 'linear-gradient(90deg,#0f766e,#14b8a6)' }} /></div>
              <span className="bar-value">{l.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-card mt-18">
        <h3>امتلاء الأفواج</h3>
        <div className="dot-legend">
          <span>الشريط الأزرق = المقاعد الممتلئة</span>
        </div>
        <div className="bar-row">
          <span className="bar-label">الاسم</span>
          <div className="bar-track"></div>
          <span className="bar-value">الممتلئ / السعة</span>
        </div>
        {groupCapacity.length === 0 && <p className="small text-muted">لا توجد أفواج بعد.</p>}
        {groupCapacity.map(g => (
          <div key={g.name} className="bar-row">
            <span className="bar-label">{g.name}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${g.capacity ? (g.occupied / g.capacity) * 100 : 0}%`, background: g.occupied >= g.capacity ? 'linear-gradient(90deg,#dc2626,#ef4444)' : undefined }} />
            </div>
            <span className="bar-value">{g.occupied}/{g.capacity}</span>
          </div>
        ))}
      </div>

      <div className="flex mt-24 wrap">
        <Link to="/admin/students" className="btn btn-primary">إدارة التلاميذ</Link>
        <Link to="/admin/teachers" className="btn btn-accent">إدارة الأساتذة والأفواج</Link>
        <Link to="/admin/payments" className="btn btn-ghost">إدارة الدفع</Link>
      </div>
    </div>
  );
}