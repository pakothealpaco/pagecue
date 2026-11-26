import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Adds the pasted cues; rejects with a message to show when they cannot be read. */
  onAdd: (text: string) => Promise<void>;
  /** Opens the file picker for a cue file instead. */
  onChooseFile: () => void;
  onClose: () => void;
}

/** Where the presenter pastes cues Claude wrote (or types them). */
export function PasteSheet({ onAdd, onChooseFile, onClose }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    field.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await onAdd(text);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet paste-sheet" role="dialog" aria-label="Add cues from Claude">
      <header className="sheet-header">
        <h2>Add cues from Claude</h2>
        <button type="button" className="quiet-button" onClick={onClose}>
          Cancel
        </button>
      </header>
      <textarea
        ref={field}
        className="paste-field"
        dir="auto"
        spellCheck={false}
        value={text}
        placeholder="Paste the cues Claude gave you"
        aria-label="Cues to add"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void add();
        }}
      />
      {error && (
        <p className="paste-error" role="alert">
          {error}
        </p>
      )}
      <div className="paste-footer">
        <button
          type="button"
          className="link-button paste-file"
          onClick={() => {
            onClose();
            onChooseFile();
          }}
        >
          Choose a file
        </button>
        <button type="button" className="empty-action" disabled={!text.trim() || busy} onClick={() => void add()}>
          Add cues
        </button>
      </div>
    </div>
  );
}
