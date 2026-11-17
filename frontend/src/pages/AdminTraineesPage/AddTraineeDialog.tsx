import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { AdminTraineeSummary } from '@itp/types';
import { createAdminTrainee } from '../../api/admin';
import {
  errorsFromApi,
  hasErrors,
  validateTraineeForm,
  type TraineeFormErrors,
} from '../../lib/addTraineeForm';
import styles from './AddTraineeDialog.module.css';

type AddTraineeDialogProps = {
  onClose: () => void;
  /** Called with the new list row; the parent closes the dialog. */
  onCreated: (trainee: AdminTraineeSummary) => void;
};

export default function AddTraineeDialog({ onClose, onCreated }: AddTraineeDialogProps) {
  const titleId = useId();
  const nameId = useId();
  const emailId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<TraineeFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onClose]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateTraineeForm(name, email);
    setErrors(found);
    setFormError(null);
    if (hasErrors(found)) return;

    setIsSaving(true);
    try {
      const created = await createAdminTrainee({ name: name.trim(), email: email.trim() });
      onCreated(created); // the parent unmounts the dialog, so no state update after this
    } catch (error) {
      const mapped = errorsFromApi(error);
      setErrors(mapped.fields);
      setFormError(mapped.form);
      setIsSaving(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.dialog}>
        <h2 id={titleId} className={styles.title}>
          Add trainee
        </h2>
        <p className={styles.intro}>
          They can sign in with their company Google account straight away, and they are assigned to
          you.
        </p>

        <form noValidate onSubmit={(event) => void handleSubmit(event)}>
          <div className={styles.field}>
            <label htmlFor={nameId} className={styles.label}>
              Full name
            </label>
            <input
              id={nameId}
              ref={nameRef}
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoComplete="off"
              disabled={isSaving}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? `${nameId}-error` : undefined}
            />
            {errors.name && (
              <p id={`${nameId}-error`} className={styles.fieldError}>
                {errors.name}
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor={emailId} className={styles.label}>
              Company email
            </label>
            <input
              id={emailId}
              type="email"
              className={styles.input}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@vonnue.com"
              autoComplete="off"
              disabled={isSaving}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? `${emailId}-error` : undefined}
            />
            {errors.email && (
              <p id={`${emailId}-error`} className={styles.fieldError}>
                {errors.email}
              </p>
            )}
          </div>

          {formError && (
            <p role="alert" className={styles.formError}>
              {formError}
            </p>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className={styles.submit} disabled={isSaving}>
              {isSaving ? 'Adding…' : 'Add trainee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
