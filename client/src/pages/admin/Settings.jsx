import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../../lib/api';
import { Loading, Modal, Field, Badge } from '../../components/ui';
import { useToast } from '../../components/Toast';

export default function AdminSettings() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [yearForm, setYearForm] = useState({ name: '' });
  const [passForm, setPassForm] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiGet('/admin/settings').then(d => setData(d)).catch(e => toast.error(e.message));
  }, [toast]);
  useEffect(load, [load]);

  async function addYear() {
    if (!yearForm.name.trim()) { toast.error('اسم السنة مطلوب.'); return; }
    setBusy(true);
    try { await apiPost('/admin/settings/years', yearForm); toast.success('تمت إضافة السنة.'); setYearForm({ name: '' }); load(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function setActive(id) {
    try { await apiPut(`/admin/settings/years/${id}/active`, {}); toast.success('تم تحديد السنة النشطة.'); load(); }
    catch (e) { toast.error(e.message); }
  }

  async function changePass() {
    if (!passForm.current || !passForm.next) { toast.error('أدخل كلمة المرور الحالية والجديدة.'); return; }
    if (passForm.next.length < 6) { toast.error('كلمة المرور الجديدة 6 أحرف على الأقل.'); return; }
    setBusy(true);
    try { await apiPut('/admin/settings/password', { current: passForm.current, next: passForm.next }); toast.success('تم تغيير كلمة المرور.'); setPassForm({ current: '', next: '' }); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  if (!data) return <Loading />;

  return (
    <div>
      <div className="page-header">
        <h1>الإعدادات</h1>
        <p className="sub">السنة الدراسية وبيانات حساب الإدارة</p>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 className="mb-12">السنة الدراسية</h3>
          {data.years.map(y => (
            <div key={y.id} className="flex between mt-8" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
              <span style={{ fontWeight: 800 }}>{y.name}</span>
              {y.is_active ? <Badge kind="green">النشطة</Badge> : (
                <button className="btn btn-ghost btn-sm" onClick={() => setActive(y.id)}>تفعيل</button>
              )}
            </div>
          ))}
          <div className="flex mt-12">
            <input className="input" placeholder="مثال: 2027/2028" value={yearForm.name} onChange={e => setYearForm({ name: e.target.value })} />
            <button className="btn btn-primary" onClick={addYear} disabled={busy}>إضافة</button>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 className="mb-12">حساب الإدارة</h3>
          <p className="small text-muted mb-12">اسم المستخدم: <b>{data.admin.username}</b></p>
          <Field label="كلمة المرور الحالية">
            <input type="password" className="input" value={passForm.current} onChange={e => setPassForm({ ...passForm, current: e.target.value })} />
          </Field>
          <Field label="كلمة المرور الجديدة">
            <input type="password" className="input" value={passForm.next} onChange={e => setPassForm({ ...passForm, next: e.target.value })} />
          </Field>
          <button className="btn btn-accent" onClick={changePass} disabled={busy}>{busy ? '...' : 'تغيير كلمة المرور'}</button>
        </div>
      </div>
    </div>
  );
}