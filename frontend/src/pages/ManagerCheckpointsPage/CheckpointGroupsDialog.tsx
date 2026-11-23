import { useEffect, useMemo, useRef, useState } from 'react';
import type { CheckpointGroup, ManagerTrainee } from '@itp/types';
import { Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import {
  createCheckpointGroup,
  deleteCheckpointGroup,
  updateCheckpointGroup,
} from '../../api/checkpoints';
import styles from './CheckpointGroupsDialog.module.css';

type Props = {
  trainees: ManagerTrainee[];
  groups: CheckpointGroup[];
  onClose: () => void;
  onChanged: () => void;
};

export default function CheckpointGroupsDialog({ trainees, groups, onClose, onChanged }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CheckpointGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return trainees;
    return trainees.filter(
      (trainee) =>
        trainee.name.toLowerCase().includes(query) || trainee.email.toLowerCase().includes(query)
    );
  }, [trainees, search]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setSelectedIds([]);
    setSearch('');
    setError(null);
  }

  function startEdit(group: CheckpointGroup) {
    setEditingId(group.id);
    setName(group.name);
    setSelectedIds(group.members.map((member) => member.id));
    setError(null);
  }

  async function handleSave() {
    if (name.trim().length < 2) {
      setError('Enter a group name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateCheckpointGroup(editingId, { name: name.trim(), traineeIds: selectedIds });
        toast.show({ message: 'Group updated.', variant: 'success' });
      } else {
        await createCheckpointGroup({ name: name.trim(), traineeIds: selectedIds });
        toast.show({ message: 'Group created.', variant: 'success' });
      }
      resetForm();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the group.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCheckpointGroup(pendingDelete.id);
      toast.show({ message: 'Group deleted.', variant: 'success' });
      if (editingId === pendingDelete.id) resetForm();
      setPendingDelete(null);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the group.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="checkpoint-groups-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!saving) onClose();
        }}
      >
        <div className={styles.shell}>
          <header className={styles.header}>
            <div>
              <h2 id="checkpoint-groups-title" className={styles.title}>
                Trainee groups
              </h2>
              <p className={styles.subtitle}>
                Reusable groups make it quick to assign a checkpoint to a cohort.
              </p>
            </div>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </header>

          <div className={styles.body}>
            <section className={styles.editor}>
              <h3>{editingId ? 'Edit group' : 'Create a group'}</h3>
              <label className={styles.field}>
                <span>Group name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Batch A — frontend"
                  maxLength={80}
                />
              </label>

              <input
                className={styles.search}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search trainees…"
                aria-label="Search trainees for the group"
              />

              <div className={styles.memberList}>
                {filtered.map((trainee) => {
                  const checked = selectedIds.includes(trainee.id);
                  return (
                    <label key={trainee.id} className={styles.memberRow}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedIds((current) =>
                            checked
                              ? current.filter((id) => id !== trainee.id)
                              : [...current, trainee.id]
                          )
                        }
                      />
                      <span>
                        {trainee.name}
                        <small>{trainee.email}</small>
                      </span>
                    </label>
                  );
                })}
              </div>

              <p className={styles.selectedCount}>{selectedIds.length} member(s) selected</p>

              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}

              <div className={styles.editorActions}>
                {editingId && (
                  <button type="button" className={styles.secondaryButton} onClick={resetForm}>
                    Cancel edit
                  </button>
                )}
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {editingId ? <Pencil size={15} /> : <Plus size={15} />}
                  {saving ? 'Saving…' : editingId ? 'Update group' : 'Create group'}
                </button>
              </div>
            </section>

            <section className={styles.listSection}>
              <h3>Existing groups</h3>
              {groups.length === 0 ? (
                <div className={styles.empty}>
                  <Users size={22} aria-hidden="true" />
                  <p>No groups yet.</p>
                </div>
              ) : (
                <ul className={styles.groupList}>
                  {groups.map((group) => (
                    <li key={group.id} className={styles.groupCard}>
                      <div>
                        <p className={styles.groupName}>{group.name}</p>
                        <p className={styles.groupMembers}>
                          {group.members.length === 0
                            ? 'No members'
                            : group.members.map((member) => member.name).join(', ')}
                        </p>
                      </div>
                      <div className={styles.groupActions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => startEdit(group)}
                          aria-label={`Edit ${group.name}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButtonDanger}
                          onClick={() => setPendingDelete(group)}
                          aria-label={`Delete ${group.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this group?"
        confirmLabel={deleting ? 'Deleting…' : 'Delete group'}
        tone="danger"
        isConfirming={deleting}
        error={error}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (deleting) return;
          setPendingDelete(null);
          setError(null);
        }}
      >
        <p>
          &ldquo;{pendingDelete?.name}&rdquo; will be removed, along with any checkpoint assignment
          made to the group. Trainees assigned individually keep their access. This does not delete
          any attempts or results.
        </p>
      </ConfirmDialog>
    </>
  );
}
