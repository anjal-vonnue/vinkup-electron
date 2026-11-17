import type { ManagerStaffMember, ManagerTrainee } from '@itp/types';
import { Pencil, Power, PowerOff } from 'lucide-react';
import styles from './ManagerTables.module.css';

type ManagerTraineeTableProps = {
  trainees: ManagerTrainee[];
  mentors: ManagerStaffMember[];
  busyId: string | null;
  assigningId: string | null;
  onEdit: (trainee: ManagerTrainee) => void;
  onToggleActive: (trainee: ManagerTrainee) => void;
  onAssign: (trainee: ManagerTrainee, mentorId: string | null) => void;
};

export default function ManagerTraineeTable({
  trainees,
  mentors,
  busyId,
  assigningId,
  onEdit,
  onToggleActive,
  onAssign,
}: ManagerTraineeTableProps) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Mentor</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className={styles.visuallyHidden}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {trainees.map((trainee) => {
            const isBusy = busyId === trainee.id || assigningId === trainee.id;
            const mentorOptions = mentors.filter(
              (mentor) => mentor.isActive && mentor.role === 'mentor'
            );
            // Keep a currently assigned but now inactive mentor visible instead of
            // silently showing "Unassigned" while the database still has the link.
            if (
              trainee.mentor &&
              !mentorOptions.some((mentor) => mentor.id === trainee.mentor!.id)
            ) {
              mentorOptions.push({
                id: trainee.mentor.id,
                name: trainee.mentor.name,
                email: trainee.mentor.email,
                role: 'mentor',
                isActive: false,
                assignedTraineeCount: 0,
                createdAt: '',
                lastLoginAt: null,
              });
            }

            return (
              <tr key={trainee.id} className={trainee.isActive ? undefined : styles.inactiveRow}>
                <td>
                  <span className={styles.name}>{trainee.name}</span>
                  <span className={styles.email}>{trainee.email}</span>
                </td>
                <td>
                  <label className={styles.visuallyHidden} htmlFor={`mentor-${trainee.id}`}>
                    Mentor for {trainee.name}
                  </label>
                  <select
                    id={`mentor-${trainee.id}`}
                    className={styles.select}
                    value={trainee.mentor?.id ?? ''}
                    disabled={isBusy || !trainee.isActive}
                    onChange={(event) => onAssign(trainee, event.target.value || null)}
                  >
                    <option value="">Unassigned</option>
                    {mentorOptions.map((mentor) => (
                      <option key={mentor.id} value={mentor.id}>
                        {mentor.name}
                        {mentor.isActive ? '' : ' (inactive)'}
                      </option>
                    ))}
                  </select>
                  {assigningId === trainee.id && (
                    <span className={styles.inlineStatus} role="status">
                      Saving…
                    </span>
                  )}
                </td>
                <td>
                  <span
                    className={`${styles.status} ${
                      trainee.isActive ? styles.statusActive : styles.statusInactive
                    }`}
                  >
                    {trainee.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => onEdit(trainee)}
                      disabled={isBusy}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </button>
                    {trainee.isActive ? (
                      <button
                        type="button"
                        className={`${styles.actionButton} ${styles.dangerButton}`}
                        onClick={() => onToggleActive(trainee)}
                        disabled={isBusy}
                      >
                        <PowerOff size={14} aria-hidden="true" />
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={() => onToggleActive(trainee)}
                        disabled={isBusy}
                      >
                        <Power size={14} aria-hidden="true" />
                        Activate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
