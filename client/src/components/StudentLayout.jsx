import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function StudentLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function onLogout() {
    logout();
    navigate('/login');
  }

  const navItem = ({ isActive }) =>
    `navlink${isActive ? ' on' : ''}`;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand" aria-label="الرئيسية">
            <img src="/images/logo-school.jpg" alt="شعار المدرسة" className="brand-logo" />
            <div className="brand-text">
              <div className="sch-name">مدرسة القمم للنجاح</div>
              <div className="sch-sub">نظام إدارة التلاميذ</div>
            </div>
          </NavLink>
          <nav className="topnav" aria-label="قائمة التنقل">
            <NavLink to="/" end className={navItem}>الرئيسية</NavLink>
            <NavLink to="/account" className={navItem}>حسابي</NavLink>
          </nav>
          <div className="topbar-spacer" />
          <div className="topbar-actions">
            <span className="user-chip" title={user?.name}>{user?.name}</span>
            <button className="btn btn-ghost btn-sm top-logout" onClick={onLogout}>الخروج</button>
          </div>
        </div>
      </header>
      {children}
      <footer className="site-foot">
        <div className="container foot-inner">
          <div className="foot-brand">
            <img src="/images/logo-school.jpg" alt="" className="foot-logo" />
            <span>مدرسة القمم للنجاح</span>
          </div>
          <div className="foot-note">نصنع المعرفة... ونبني طريق النجاح</div>
          <nav className="foot-links" aria-label="روابط سريعة">
            <NavLink to="/">الرئيسية</NavLink>
            <NavLink to="/account">حسابي</NavLink>
          </nav>
          <div className="foot-copy">© {new Date().getFullYear()} جميع الحقوق محفوظة</div>
        </div>
      </footer>
    </>
  );
}