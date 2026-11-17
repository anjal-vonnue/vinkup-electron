import type { ManagerStaffMember } from '@itp/types';
import { Pencil, Power, PowerOff } from 'lucide-react';
import styles from './ManagerTables.module.css';

type ManagerStaffTableProps = {
  staff: ManagerStaffMember[];
  currentUserId: string;
  busyId: string | null;
  onEdit: (staff: ManagerStaffMember) => void;
  onToggleActive: (staff: ManagerStaffMember) => void;
};

function roleLabel(role: ManagerStaffMember['role']): string {
  return role === 'manager' ? 'Manager' : 'Mentor';
}

function formatLastLogin(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ManagerStaffTable({
  staff,
  currentUserId,
  busyId,
  onEdit,
  onToggleActive,
}: ManagerStaffTableProps) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col">Trainees</th>
            <th scope="col">Last sign-in</th>
            <th scope="col">
              <span className={styles.visuallyHidden}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => {
            const isSelf = member.id === currentUserId;
            const isBusy = busyId === member.id;
            return (
              <tr key={member.id} className={member.isActive ? undefined : styles.inactiveRow}>
                <td>
                  <span className={styles.name}>{member.name}</span>
                  <span className={styles.email}>{member.email}</span>
                </td>
                <td>
                  <span className={styles.role}>{roleLabel(member.role)}</span>
                </td>
                <td>
                  <span
                    className={`${styles.status} ${
                      member.isActive ? styles.statusActive : styles.statusInactive
                    }`}
                  >
                    {member.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{member.role === 'mentor' ? member.assignedTraineeCount : '—'}</td>
                <td>{formatLastLogin(member.lastLoginAt)}</td>
                <td>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => onEdit(member)}
                      disabled={isBusy}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </button>
                    {member.isActive ? (
                      <button
                        type="button"
                        className={`${styles.actionButton} ${styles.dangerButton}`}
                        onClick={() => onToggleActive(member)}
                        disabled={isBusy || isSelf}
                        title={isSelf ? 'You cannot deactivate your own account.' : undefined}
                      >
                        <PowerOff size={14} aria-hidden="true" />
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={() => onToggleActive(member)}
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
