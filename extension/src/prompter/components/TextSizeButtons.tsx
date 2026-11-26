import { useState } from 'react';
import { modKey } from '../../lib/platform';
import { stepTextSize, TEXT_SIZE_ORDER, type TextSize } from '../useSettings';

interface Props {
  size: TextSize;
  onChange: (size: TextSize) => void;
}

/** Smaller and larger text, one step a click, as in PowerPoint's and Keynote's presenter views. */
export function TextSizeButtons({ size, onChange }: Props) {
  const [announce, setAnnounce] = useState('');
  const step = (delta: 1 | -1): void => {
    const next = stepTextSize(size, delta);
    onChange(next);
    setAnnounce(`Text size ${next}`);
  };
  return (
    <div className="size-buttons" role="group" aria-label="Text size">
      <button
        type="button"
        className="icon-button size-smaller"
        aria-label="Smaller text"
        title={`Smaller text (${modKey('−')})`}
        disabled={size === TEXT_SIZE_ORDER[0]}
        onClick={() => step(-1)}
      >
        A
      </button>
      <button
        type="button"
        className="icon-button size-larger"
        aria-label="Larger text"
        title={`Larger text (${modKey('+')})`}
        disabled={size === TEXT_SIZE_ORDER.at(-1)}
        onClick={() => step(1)}
      >
        A
      </button>
      <span className="visually-hidden" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
