import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import styles from './InlineRenameInput.module.css';

type InlineRenameInputProps = {
  initialName: string;
  /** Returns an error message to keep editing, or null once the rename was applied. */
  onSubmit: (name: string) => string | null;
  onCancel: () => void;
};

export default function InlineRenameInput({
  initialName,
  onSubmit,
  onCancel,
}: InlineRenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);
  const errorId = useId();
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Like VS Code: select the name without its extension.
    const dot = initialName.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : initialName.length);
  }, [initialName]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Keep Space, Backspace, Delete and the arrows away from the tree's own shortcuts.
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      const message = onSubmit(value);
      if (message) setError(message);
      else finishedRef.current = true;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finishedRef.current = true;
      onCancel();
    }
  }

  function handleBlur() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    // Clicking away applies a valid change and quietly drops an invalid or unchanged one.
    if (value === initialName || onSubmit(value) !== null) onCancel();
  }

  return (
    <span className={styles.wrapper}>
      <input
        ref={inputRef}
        className={styles.input}
        value={value}
        maxLength={200}
        spellCheck={false}
        autoComplete="off"
        aria-label={`Rename ${initialName}`}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onClick={(event) => event.stopPropagation()}
      />
      {error && (
        <span id={errorId} role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </span>
  );
}
