import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const ToastContext = createContext(null);
let seq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'info', duration = 3200) => {
    const id = ++seq;
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  }, []);

  const toast = useMemo(() => ({
    success: m => push(m, 'success'),
    error: m => push(m, 'error'),
    warn: m => push(m, 'warn'),
    info: m => push(m, 'info')
  }), [push]);

  const icons = { success: '✅', error: '⛔', warn: '⚠️', info: 'ℹ️' };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" dir="ltr">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`} dir="rtl">
            <span className="ico">{icons[t.type]}</span>
            <span className="msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}