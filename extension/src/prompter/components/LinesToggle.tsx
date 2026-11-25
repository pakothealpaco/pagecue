interface Props {
  on: boolean;
  onToggle: () => void;
}

/**
 * Shows or hides section lines on the page. While they are on it stays visible even when the rest
 * of the window chrome fades, because the lines are on the page viewers see.
 */
export function LinesToggle({ on, onToggle }: Props) {
  const label = on
    ? 'Section lines are showing on the page, where viewers see them. Click or press L to hide.'
    : 'Show section lines on the page (L). Viewers will see them.';
  return (
    <button
      type="button"
      className={`icon-button lines-toggle${on ? ' is-sticky' : ''}`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="label">Lines</span>
    </button>
  );
}
