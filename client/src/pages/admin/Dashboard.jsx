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

  const { stats, currentCycle, monthlyChart, levelChart, groupCapacity } = state.data;
  const maxMonthly = Math.max(...monthlyChart.map(m => m.paid), 1);
  const maxLevel = Math.max(...levelChart.map(l => l.count), 1);

  const cards = [
    { icon: '🎓', color: '#eff6ff', num: stats.students, label: 'عدد التلاميذ' },
    { icon: '👨‍🏫', color: '#ecfeff', num: stats.teachers, label: 'عدد الأساتذة' },
    { icon: '🗂️', color: '#fef3c7', num: stats.groups, label: 'عدد الأفواج' },
    { icon: '✅', color: '#dcfce7', num: stats.selections, label: 'عدد الاختيارات' },
    { icon: '⏳', color: '#fff7ed', num: stats.studentsWithoutSelection, label: 'تلاميذ لم يختاروا بعد' },
    { icon: '💳', color: '#dcfce7', num: stats.studentsRod, label: 'سدّدوا الدورة الحالية' },
    { icon: '⛔', color: '#fee2e2', num: stats.studentsNotPaid, label: 'لم يدفعوا الدورة الحالية' }
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

      {currentCycle && (
        <div className="chart-card mt-18">
          <div className="flex between wrap" style={{ gap: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>الذين لم يدفعوا — {currentCycle.label}</h3>
              <p className="small text-muted" style={{ margin: '6px 0 0' }}>
                دورة الاستحقاق: {currentCycle.start_date} إلى {currentCycle.end_date}
                {currentCycle.days_left > 0 && ` — باقي ${currentCycle.days_left} يوم`}
              </p>
            </div>
            <div className="flex wrap" style={{ gap: 8 }}>
              <Link to="/admin/unpaid" className="btn btn-primary btn-sm">قائمة غير المدفوعين ({stats.studentsNotPaid})</Link>
              <Link to="/admin/payment-history" className="btn btn-ghost btn-sm">سجل الدورات</Link>
            </div>
          </div>

          <div className="stat-grid mt-18">
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#fee2e2' }}>⛔</div>
              <div><div className="num">{currentCycle.unpaid}</div><div className="lbl">لم يدفعوا هذه الدورة</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#dcfce7' }}>✅</div>
              <div><div className="num">{currentCycle.paid}</div><div className="lbl">سدّدوا هذه الدورة</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#eff6ff' }}>💰</div>
              <div><div className="num">{currentCycle.collected} دج</div><div className="lbl">المحصّل في الدورة</div></div>
            </div>
          </div>

          {currentCycle.unpaid === 0
            ? <p className="small text-muted mt-18">كل التلاميذ سدّدوا هذه الدورة. ✅</p>
            : <p className="small text-muted mt-18">اضغط «قائمة غير المدفوعين» لعرض الأسماء مع البحث والتصفية وتسجيل الدفع مباشرة.</p>}
        </div>
      )}

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
        <h3>الدفع الشهري (الدورات الحقيقية)</h3>
        {monthlyChart.map(m => (
          <div key={m.cycle_id || m.month} className="bar-row">
            <span className="bar-label">{m.month}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(m.paid / (m.total || 1)) * 100}%` }} /></div>
            <span className="bar-value">{m.paid}/{m.total}</span>
          </div>
        ))}
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
        <Link to="/admin/unpaid" className="btn btn-ghost">الذين لم يدفعوا</Link>
        <Link to="/admin/payment-history" className="btn btn-ghost">سجل الدفعات</Link>
      </div>
    </div>
  );
}