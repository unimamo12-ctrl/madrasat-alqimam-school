import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
  { to: '/admin/students', label: 'التلاميذ', icon: '🎓' },
  { to: '/admin/teachers', label: 'الأساتذة', icon: '👨‍🏫' },
  { to: '/admin/subjects', label: 'المواد', icon: '📚' },
  { to: '/admin/levels', label: 'المستويات والشعب', icon: '🏫' },
  { to: '/admin/selections', label: 'اختيارات التلاميذ', icon: '✅' },
  { to: '/admin/teacher-choices', label: 'اختيارات التلاميذ للأساتذة', icon: '🗂️' },
  { to: '/admin/payments', label: 'الدفع', icon: '💳' },
  { to: '/admin/unpaid', label: 'الذين لم يدفعوا', icon: '⛔' },
  { to: '/admin/payment-history', label: 'سجل الدفعات', icon: '🧾' },
  { to: '/admin/announcements', label: 'الإعلان', icon: '📣' },
  { to: '/admin/settings', label: 'الإعدادات', icon: '⚙️' }
];

export default function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function onLogout() { logout(); navigate('/login'); }

  return (
    <div className="admin-shell">
      {open && <div className="side-overlay" onClick={() => setOpen(false)} />}
      <aside className={`admin-side ${open ? 'open' : ''}`}>
        <div className="brand">
          <img src="/logo.svg" alt="شعار المدرسة" />
          <div>
            <div className="n">مدرسة القمم النجاح</div>
            <div className="t">لوحة الإدارة</div>
          </div>
        </div>
        <nav className="admin-nav">
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setOpen(false)}>
              <span className="ico">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <a onClick={onLogout} style={{ cursor: 'pointer' }}><span className="ico">🚪</span> تسجيل الخروج</a>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-top">
          <h1>مدرسة القمم النجاح</h1>
          <div className="flex wrap">
            <button className="btn btn-ghost btn-sm menu-btn" onClick={() => setOpen(true)}>☰ القائمة</button>
            <div className="role-chip">مدير النظام</div>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}