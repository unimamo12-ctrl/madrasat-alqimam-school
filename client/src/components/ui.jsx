export function Modal({ open, onClose, title, children, footer, wide }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: wide ? 760 : 520 }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="إغلاق">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'تأكيد الاختيار', cancelLabel = 'إلغاء', danger, confirmBusy }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn btn-primary" onClick={onConfirm} disabled={confirmBusy}>
            {confirmBusy ? '...' : confirmLabel}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={confirmBusy}>{cancelLabel}</button>
        </>
      }
    >
      <div className="confirm-box">
        <div className="q">{message}</div>
        {danger && <div className="small text-muted" style={{ color: 'var(--danger)' }}>لا يمكن التراجع عن هذه العملية.</div>}
      </div>
    </Modal>
  );
}

export function Loading({ label = 'جارِ التحميل...' }) {
  return (
    <div className="state-box">
      <div className="spinner" />
      <div className="title">{label}</div>
    </div>
  );
}

export function Empty({ icon = '🗒️', title = 'لا توجد بيانات', hint = '' }) {
  return (
    <div className="state-box">
      <div className="big">{icon}</div>
      <div className="title">{title}</div>
      {hint && <p className="text-muted small">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message = 'حدث خطأ، حاول مجدداً', onRetry }) {
  return (
    <div className="state-box">
      <div className="big">⚠️</div>
      <div className="title">{message}</div>
      {onRetry && <button className="btn btn-ghost mt-12" onClick={onRetry}>إعادة المحاولة</button>}
    </div>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

export function Pill({ label, on, onClick, teal, disabled }) {
  return (
    <button type="button" className={`pill ${on ? 'on' : ''} ${teal && on ? 'teal' : ''}`} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

export function Badge({ kind = 'gray', children }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  if (status) return <Badge kind="green">فعال</Badge>;
  return <Badge kind="red">غير فعال</Badge>;
}

export function Avatar({ firstName, lastName, photo, size = 44 }) {
  const name = `${firstName || ''} ${lastName || ''}`.trim();
  const initial = (name || '؟').trim().charAt(0);
  return (
    <div style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', flex: 'none' }}>
      {photo ? (
        <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'grid', placeItems: 'center',
          fontWeight: 900, fontSize: size * 0.42, color: '#1d4ed8', background: 'linear-gradient(135deg,#dbeafe,#ccfbf1)'
        }}>{initial}</div>
      )}
    </div>
  );
}