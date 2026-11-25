import { useEffect, useState } from 'react';

/** Time since this page was connected, as m:ss. Click to start again. */
export function Timer() {
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const label = `${minutes}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <button
      type="button"
      className="timer"
      title="Time presenting. Click to start again."
      aria-label={`Time presenting, ${minutes} minutes ${seconds % 60} seconds. Start again`}
      onClick={() => {
        setStart(Date.now());
        setNow(Date.now());
      }}
    >
      {label}
      <span className="reset" aria-hidden="true">
        ↺
      </span>
    </button>
  );
}
