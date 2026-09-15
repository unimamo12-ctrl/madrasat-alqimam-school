import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import { Field } from '../components/ui';

const TABS = [
  { id: 'student', label: 'تلميذ', desc: 'مدرسة القمم النجاح' },
  { id: 'admin', label: 'الإدارة', desc: 'لوحة التحكم' }
];

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState('student');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    firstName: '', lastName: '', regNumber: '',
    username: '', password: ''
  });

  const set = k => e => setForm({ ...form, [k]: e.target.value });

  function validate() {
    const e = {};
    if (tab === 'student') {
      if (!form.firstName.trim()) e.firstName = 'يرجى إدخال الاسم';
      if (!form.lastName.trim()) e.lastName = 'يرجى إدخال اللقب';
      if (!form.regNumber.trim()) e.regNumber = 'يرجى إدخال رقم التسجيل';
    } else {
      if (!form.username.trim()) e.username = 'يرجى إدخال اسم المستخدم';
      if (!form.password) e.password = 'يرجى إدخال كلمة المرور';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev) {
    ev.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    try {
      const user = tab === 'student'
        ? await login('student', { firstName: form.firstName, lastName: form.lastName, regNumber: form.regNumber })
        : await login('admin', { username: form.username, password: form.password });

      toast.success(tab === 'student' ? 'مرحباً بك في مدرسة القمم النجاح' : 'مرحباً بالإدارة');
      navigate(tab === 'admin' ? '/admin' : '/');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <span className="auth-logo">
          <img src="/images/logo-school.jpg" alt="شعار المدرسة" />
        </span>
        <h1>مدرسة القمم النجاح</h1>
        <p className="auth-sub">نصنع المعرفة... ونبني طريق النجاح</p>

        <div className="auth-tabs" role="tablist" aria-label="نوع الحساب">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`auth-tab ${tab === t.id ? 'on' : ''}`}
              onClick={() => { setTab(t.id); setErrors({}); }}
            >
              <span>{t.label}</span>
              <small>{t.desc}</small>
            </button>
          ))}
        </div>

        <form onSubmit={submit} noValidate>
          {tab === 'student' ? (
            <>
              <Field label="الاسم" error={errors.firstName}>
                <input className={`input ${errors.firstName ? 'err' : ''}`} value={form.firstName} onChange={set('firstName')} placeholder="مثال: أحمد" autoFocus />
              </Field>
              <Field label="اللقب" error={errors.lastName}>
                <input className={`input ${errors.lastName ? 'err' : ''}`} value={form.lastName} onChange={set('lastName')} placeholder="مثال: بوزيد" />
              </Field>
              <Field label="رقم التسجيل" error={errors.regNumber}>
                <input className={`input ${errors.regNumber ? 'err' : ''}`} value={form.regNumber} onChange={set('regNumber')} placeholder="مثال: 2026-0001" />
              </Field>
              <div className="auth-tip">يرجى ملء المعلومات كما هي مكتوبة في البطاقة المدرسية.</div>
            </>
          ) : (
            <>
              <Field label="اسم المستخدم" error={errors.username}>
                <input className={`input ${errors.username ? 'err' : ''}`} value={form.username} onChange={set('username')} autoFocus />
              </Field>
              <Field label="كلمة المرور" error={errors.password}>
                <input type="password" className={`input ${errors.password ? 'err' : ''}`} value={form.password} onChange={set('password')} />
              </Field>
              <div className="auth-tip">هذا الفضاء مخصّص للإدارة فقط، ولا علاقة له بحساب التلميذ.</div>
            </>
          )}

          <button type="submit" className="btn btn-primary btn-lg btn-block" style={{ marginTop: 20 }} disabled={busy}>
            {busy ? '...جارٍ التحقق' : 'تسجيل الدخول'}
          </button>
        </form>

        <p className="small text-muted auth-foot" style={{ textAlign: 'center', marginTop: 18, fontWeight: 600 }}>
          © {new Date().getFullYear()} مدرسة القمم النجاح — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}