import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { folderPathError } from '../../lib/relocatePath';
import styles from './NewFolderInput.module.css';

type NewFolderInputProps = {
  existingPaths: string[];
  initialValue?: string;
  onSubmit: (path: string) => void;
  onCancel: () => void;
};

export default function NewFolderInput({
  existingPaths,
  initialValue = '',
  onSubmit,
  onCancel,
}: NewFolderInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);
  const errorId = useId();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  function submit() {
    const path = value.trim().replace(/^\.\//, '').replace(/\/+$/, '');
    const message = folderPathError(path, existingPaths);
    if (message) {
      setError(message);
      return;
    }
    finishedRef.current = true;
    onSubmit(path);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finishedRef.current = true;
      onCancel();
    }
  }

  return (
    <div className={styles.wrapper}>
      <input
        ref={inputRef}
        className={styles.input}
        value={value}
        maxLength={200}
        spellCheck={false}
        autoComplete="off"
        placeholder="Folder name, e.g. src/components"
        aria-label="New folder name"
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!finishedRef.current) onCancel();
        }}
      />
      {error ? (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      ) : (
        <p className={styles.hint}>Next, you&rsquo;ll name the first file inside it.</p>
      )}
    </div>
  );
}
