export default function DeleteReminderModal({ reminder, seniorName, onConfirm, onClose, deleting, error }) {
  return (
    <div className="db-modal-overlay" onClick={() => !deleting && onClose()}>
      <div className="db-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="db-modal__title">Delete Reminder</h2>
        <p style={{ fontSize: 14, color: 'var(--fg-2)', lineHeight: 1.5, marginBottom: 'var(--space-6)' }}>
          This will permanently remove &ldquo;{reminder.title}&rdquo; and it will no longer be
          mentioned during calls with {seniorName}.
        </p>
        {error && <p className="db-error-inline">{error}</p>}
        <div className="db-modal__actions">
          <button
            type="button"
            className="db-btn db-btn--ghost"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="db-btn db-btn--primary"
            style={{ background: 'var(--color-danger)' }}
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
}
