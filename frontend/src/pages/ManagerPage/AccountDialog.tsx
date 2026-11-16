import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ManagerStaffMember, ManagerStaffRole, ManagerTrainee } from '@itp/types';
import { ApiError } from '../../api/errors';
import {
  createManagerStaff,
  createManagerTrainee,
  updateManagerStaff,
  updateManagerTrainee,
} from '../../api/manager';
import styles from './AccountDialog.module.css';

type DialogTarget =
  | { kind: 'staff'; mode: 'create' }
  | { kind: 'staff'; mode: 'edit'; record: ManagerStaffMember }
  | { kind: 'trainee'; mode: 'create' }
  | { kind: 'trainee'; mode: 'edit'; record: ManagerTrainee };

type AccountDialogProps = {
  target: DialogTarget;
  /** Active mentors, for the optional assignment on a new trainee. */
  mentors: ManagerStaffMember[];
  onClose: () => void;
  onSaved: (message: string, saved: ManagerStaffMember | ManagerTrainee) => void;
};

type FieldErrors = { name?: string; email?: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(name: string, email: string): FieldErrors {
  const errors: FieldErrors = {};
  const trimmed = name.trim();
  if (trimmed.length < 2) errors.name = 'Enter the full name.';
  else if (trimmed.length > 80) errors.name = 'Keep the name under 80 characters.';
  if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';
  return errors;
}

function hasErrors(errors: FieldErrors): boolean {
  return Boolean(errors.name ?? errors.email);
}

function apiErrorFor(error: unknown): { fields: FieldErrors; form: string | null } {
  if (!(error instanceof ApiError)) {
    return { fields: {}, form: 'Could not save the account. Please try again.' };
  }
  switch (error.code) {
    case 'STAFF_EXISTS':
      return { fields: { email: 'A staff account with this email already exists.' }, form: null };
    case 'TRAINEE_EXISTS':
      return { fields: { email: 'This email is already in use by a trainee.' }, form: null };
    case 'EMAIL_BELONGS_TO_ADMIN':
      return { fields: { email: 'This email is already in use by a staff account.' }, form: null };
    case 'DOMAIN_NOT_PERMITTED':
      return { fields: { email: error.message }, form: null };
    case 'INVALID_MENTOR':
      return { fields: {}, form: 'Choose an active mentor.' };
    case 'VALIDATION_FAILED':
      return { fields: {}, form: 'Check the name and email and try again.' };
    default:
      return { fields: {}, form: error.message };
  }
}

export default function AccountDialog({ target, mentors, onClose, onSaved }: AccountDialogProps) {
  const titleId = useId();
  const nameId = useId();
  const emailId = useId();
  const roleId = useId();
  const mentorId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  const record = 'record' in target ? target.record : null;
  const isEdit = target.mode === 'edit';
  const isStaff = target.kind === 'staff';

  const [name, setName] = useState(record?.name ?? '');
  const [email, setEmail] = useState(record?.email ?? '');
  const [role, setRole] = useState<ManagerStaffRole>(
    isStaff && record ? (record as ManagerStaffMember).role : 'mentor'
  );
  const [assignedMentorId, setAssignedMentorId] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
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

  const title = isEdit
    ? `Edit ${isStaff ? 'staff account' : 'trainee'}`
    : `Add ${isStaff ? 'staff account' : 'trainee'}`;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validate(name, email);
    setErrors(found);
    setFormError(null);
    if (hasErrors(found)) return;

    setIsSaving(true);
    try {
      if (isStaff && isEdit) {
        const saved = await updateManagerStaff(record!.id, {
          name: name.trim(),
          email: email.trim(),
          role,
        });
        onSaved(`${name.trim()} was updated.`, saved);
      } else if (isStaff) {
        const saved = await createManagerStaff({ name: name.trim(), email: email.trim(), role });
        onSaved(`${name.trim()} was added as a ${role}.`, saved);
      } else if (isEdit) {
        const saved = await updateManagerTrainee(record!.id, {
          name: name.trim(),
          email: email.trim(),
        });
        onSaved(`${name.trim()} was updated.`, saved);
      } else {
        const saved = await createManagerTrainee({
          name: name.trim(),
          email: email.trim(),
          mentorId: assignedMentorId || null,
        });
        onSaved(`${name.trim()} was added.`, saved);
      }
    } catch (error) {
      const mapped = apiErrorFor(error);
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
          {title}
        </h2>
        <p className={styles.intro}>
          {isStaff
            ? 'Staff sign in with their company Google account. Deactivated accounts keep their data but cannot sign in.'
            : 'Trainees sign in with their company Google account. Reassign them at any time from the table.'}
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

          {isStaff && (
            <div className={styles.field}>
              <label htmlFor={roleId} className={styles.label}>
                Role
              </label>
              <select
                id={roleId}
                className={styles.input}
                value={role}
                onChange={(event) => setRole(event.target.value as ManagerStaffRole)}
                disabled={isSaving}
              >
                <option value="mentor">Mentor</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          )}

          {!isStaff && !isEdit && (
            <div className={styles.field}>
              <label htmlFor={mentorId} className={styles.label}>
                Mentor <span className={styles.optional}>(optional)</span>
              </label>
              <select
                id={mentorId}
                className={styles.input}
                value={assignedMentorId}
                onChange={(event) => setAssignedMentorId(event.target.value)}
                disabled={isSaving}
              >
                <option value="">Leave unassigned</option>
                {mentors.map((mentor) => (
                  <option key={mentor.id} value={mentor.id}>
                    {mentor.name} ({mentor.email})
                  </option>
                ))}
              </select>
            </div>
          )}

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
              {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
