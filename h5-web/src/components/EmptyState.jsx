export default function EmptyState({ icon, title, description, action, onAction }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--color-text-secondary)' }}>
      {icon && <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>}
      {title && <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>{title}</div>}
      {description && <div style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.6, marginBottom: action ? 20 : 0 }}>{description}</div>}
      {action && onAction && (
        <button className="primary-button" onClick={onAction} style={{ marginTop: 8, padding: '10px 24px', fontSize: 'var(--font-size-sm)' }}>
          {action}
        </button>
      )}
    </div>
  );
}
