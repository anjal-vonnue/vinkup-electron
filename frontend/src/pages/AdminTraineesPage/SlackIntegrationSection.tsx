import { useEffect, useState, type FormEvent } from 'react';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { toApiError } from '../../api/errors';
import {
  deleteMentorSlackChannel,
  getMentorSlackChannel,
  saveMentorSlackChannel,
} from '../../api/admin';
import styles from './SlackIntegrationSection.module.css';

type Mode = 'loading' | 'empty' | 'view' | 'edit' | 'error';

function normalizeChannelId(value: string): string {
  return value.trim().toUpperCase();
}

function validateChannelId(value: string): string | null {
  const trimmed = normalizeChannelId(value);
  if (!trimmed) return 'Enter a Slack channel ID.';
  if (trimmed.length > 32) return 'Slack channel ID is too long.';
  if (!/^[A-Z0-9]+$/.test(trimmed)) return 'Enter a valid Slack channel ID.';
  return null;
}

export default function SlackIntegrationSection() {
  const { show } = useToast();
  const [mode, setMode] = useState<Mode>('loading');
  const [channelId, setChannelId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMentorSlackChannel()
      .then((res) => {
        if (cancelled) return;
        setChannelId(res.channelId);
        setDraft(res.channelId ?? '');
        setMode(res.channelId ? 'view' : 'empty');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(toApiError(error).message);
        setMode('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const validationError = validateChannelId(draft);
    if (validationError) {
      setInputError(validationError);
      return;
    }

    setIsSaving(true);
    setInputError(null);
    try {
      const next = normalizeChannelId(draft);
      const res = await saveMentorSlackChannel({ channelId: next });
      setChannelId(res.channelId);
      setDraft(res.channelId ?? '');
      setMode('view');
      show({ message: 'Slack channel saved.', variant: 'success' });
    } catch (error) {
      setInputError(toApiError(error).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteMentorSlackChannel();
      setChannelId(null);
      setDraft('');
      setMode('empty');
      setConfirmDeleteOpen(false);
      show({ message: 'Slack channel disconnected.', variant: 'success' });
    } catch (error) {
      show({ message: toApiError(error).message, variant: 'error' });
    } finally {
      setIsDeleting(false);
    }
  }

  if (mode === 'loading') {
    return (
      <section className={styles.card} aria-label="Slack integration">
        <p className={styles.status} role="status">
          Loading Slack integration…
        </p>
      </section>
    );
  }

  if (mode === 'error') {
    return (
      <section className={styles.card} aria-label="Slack integration">
        <h2 className={styles.title}>Slack integration</h2>
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      </section>
    );
  }

  const isEditing = mode === 'edit' || mode === 'empty';

  return (
    <section className={styles.card} aria-label="Slack integration">
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Slack integration</h2>
          <p className={styles.description}>
            Connect a Slack channel to receive notifications whenever your trainees submit or
            resubmit tasks.
          </p>
        </div>
        {channelId && mode === 'view' && <span className={styles.badge}>Connected</span>}
      </div>

      {mode === 'view' && channelId && (
        <div className={styles.configured}>
          <div className={styles.channelRow}>
            <span className={styles.channelLabel}>Channel ID</span>
            <code className={styles.channelValue}>{channelId}</code>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setDraft(channelId);
                setInputError(null);
                setMode('edit');
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {isEditing && (
        <form className={styles.form} onSubmit={(event) => void handleSave(event)}>
          <label className={styles.label} htmlFor="slack-channel-id">
            Slack Channel ID
          </label>
          <input
            id="slack-channel-id"
            name="slackChannelId"
            className={styles.input}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (inputError) setInputError(null);
            }}
            placeholder="e.g. C0123ABCDEF"
            autoComplete="off"
            maxLength={32}
            disabled={isSaving}
            aria-describedby="slack-channel-help slack-channel-error"
          />
          <p id="slack-channel-help" className={styles.help}>
            In Slack, open the channel, click the channel name, and copy the Channel ID from the
            channel details. The Vinkup bot must be invited to this channel.
          </p>
          {inputError && (
            <p id="slack-channel-error" className={styles.error} role="alert">
              {inputError}
            </p>
          )}
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Channel'}
            </button>
            {mode === 'edit' && (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={isSaving}
                onClick={() => {
                  setDraft(channelId ?? '');
                  setInputError(null);
                  setMode(channelId ? 'view' : 'empty');
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Disconnect Slack channel?"
        confirmLabel={isDeleting ? 'Disconnecting…' : 'Disconnect'}
        tone="danger"
        isConfirming={isDeleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (!isDeleting) setConfirmDeleteOpen(false);
        }}
      >
        <p>
          Task submission notifications will stop being delivered to <strong>{channelId}</strong>.
          You can connect a channel again later.
        </p>
      </ConfirmDialog>
    </section>
  );
}
