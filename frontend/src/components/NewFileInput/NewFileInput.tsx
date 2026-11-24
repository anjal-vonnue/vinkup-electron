import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { validateFileName } from '../../lib/validateFileName';
import styles from './NewFileInput.module.css';

type NewFileInputProps = {
  existingPaths: string[];
  onCreate: (path: string) => void;
  onCancel: () => void;
  initialValue?: string;
};

export default function NewFileInput({
  existingPaths,
  onCreate,
  onCancel,
  initialValue,
}: NewFileInputProps) {
  const [value, setValue] = useState(initialValue ?? '');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      onCancel();
      return;
    }

    if (event.key !== 'Enter') return;

    const result = validateFileName(value, existingPaths);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    onCreate(result.path);
  }

  function handleBlur() {
    if (value.trim().length === 0) onCancel();
  }

  return (
    <div className={styles.container}>
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        placeholder="name.css or src/name.ts"
        value={value}
        aria-invalid={error !== null}
        aria-label="New file name"
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
