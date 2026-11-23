import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CheckpointGroup,
  CheckpointMarkdownPreview,
  CreateCheckpointRequest,
  ManagerTrainee,
} from '@itp/types';
import { FileText, Upload, X } from 'lucide-react';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import {
  createManagerCheckpoint,
  getManagerCheckpoint,
  previewCheckpointMarkdown,
  publishManagerCheckpoint,
  updateManagerCheckpoint,
} from '../../api/checkpoints';
import styles from './CheckpointFormDialog.module.css';

type FormTarget = { mode: 'create' } | { mode: 'edit'; checkpointId: string };

type FormState = {
  title: string;
  description: string;
  durationMinutes: string;
  totalMarks: string;
  passingMarks: string;
  startDate: string;
  startTime: string;
  maxAttempts: string;
  allowEarlySubmission: boolean;
  allowLateEntry: boolean;
  resultVisibility: 'IMMEDIATE' | 'AFTER_APPROVAL';
  sourceFileName: string | null;
  sourceMarkdown: string;
  traineeIds: string[];
  groupIds: string[];
};

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  durationMinutes: '60',
  totalMarks: '100',
  passingMarks: '40',
  startDate: '',
  startTime: '09:00',
  maxAttempts: '1',
  allowEarlySubmission: true,
  allowLateEntry: true,
  resultVisibility: 'AFTER_APPROVAL',
  sourceFileName: null,
  sourceMarkdown: '',
  traineeIds: [],
  groupIds: [],
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function splitIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '09:00' };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: '', time: '09:00' };
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function buildStartAt(date: string, time: string): string | null {
  if (!date) return null;
  const value = new Date(`${date}T${time || '09:00'}:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function questionTypeLabel(type: string): string {
  switch (type) {
    case 'MULTIPLE_CHOICE':
      return 'Multiple choice';
    case 'LONG_TEXT':
      return 'Long answer';
    case 'CODE':
      return 'Code';
    case 'SQL':
      return 'SQL';
    case 'FILE':
      return 'File upload';
    case 'PRACTICAL':
      return 'Practical task';
    default:
      return 'Text';
  }
}

type Props = {
  target: FormTarget;
  trainees: ManagerTrainee[];
  groups: CheckpointGroup[];
  onClose: () => void;
  onSaved: (message: string) => void;
};

export default function CheckpointFormDialog({
  target,
  trainees,
  groups,
  onClose,
  onSaved,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRequestRef = useRef(0);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [savedId, setSavedId] = useState<string | null>(
    target.mode === 'edit' ? target.checkpointId : null
  );
  const [loading, setLoading] = useState(target.mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CheckpointMarkdownPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Load the existing paper when editing.
  useEffect(() => {
    if (target.mode !== 'edit') return;
    let cancelled = false;
    getManagerCheckpoint(target.checkpointId)
      .then((checkpoint) => {
        if (cancelled) return;
        const start = splitIso(checkpoint.startAt);
        setForm({
          title: checkpoint.title,
          description: checkpoint.description,
          durationMinutes: String(checkpoint.durationMinutes),
          totalMarks: String(checkpoint.totalMarks),
          passingMarks: String(checkpoint.passingMarks),
          startDate: start.date,
          startTime: start.time,
          maxAttempts: String(checkpoint.maxAttempts),
          allowEarlySubmission: checkpoint.allowEarlySubmission,
          allowLateEntry: checkpoint.allowLateEntry,
          resultVisibility: checkpoint.resultVisibility,
          sourceFileName: checkpoint.sourceFileName,
          sourceMarkdown: checkpoint.sourceMarkdown,
          traineeIds: checkpoint.assignment.traineeIds,
          groupIds: checkpoint.assignment.groupIds,
        });
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setFormError(caught instanceof Error ? caught.message : 'Could not load the checkpoint.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  // Parse the Markdown on the server for the preview panel. Debounced so typing
  // in the textarea doesn't flood the API.
  useEffect(() => {
    if (!form.sourceMarkdown.trim()) return;
    const sequence = ++previewRequestRef.current;
    const timer = setTimeout(() => {
      setPreviewBusy(true);
      previewCheckpointMarkdown(form.sourceMarkdown)
        .then((result) => {
          if (previewRequestRef.current !== sequence) return;
          setPreview(result);
          setPreviewError(null);
        })
        .catch((caught: unknown) => {
          if (previewRequestRef.current !== sequence) return;
          setPreviewError(
            caught instanceof Error ? caught.message : 'Could not parse the Markdown file.'
          );
        })
        .finally(() => {
          if (previewRequestRef.current === sequence) setPreviewBusy(false);
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [form.sourceMarkdown]);

  const filteredTrainees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return trainees;
    return trainees.filter(
      (trainee) =>
        trainee.name.toLowerCase().includes(query) || trainee.email.toLowerCase().includes(query)
    );
  }, [trainees, search]);

  const selectedTraineeCount = useMemo(() => {
    const ids = new Set(form.traineeIds);
    for (const group of groups) {
      if (!form.groupIds.includes(group.id)) continue;
      for (const member of group.members) ids.add(member.id);
    }
    return ids.size;
  }, [form.traineeIds, form.groupIds, groups]);

  // The preview belongs to the current Markdown. Clearing the textarea must not
  // leave an old parsed paper on screen while the request state is cleaned up.
  const hasMarkdown = form.sourceMarkdown.trim().length > 0;
  const visiblePreview = hasMarkdown ? preview : null;
  const visiblePreviewError = hasMarkdown ? previewError : null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleTrainee(id: string) {
    update(
      'traineeIds',
      form.traineeIds.includes(id)
        ? form.traineeIds.filter((value) => value !== id)
        : [...form.traineeIds, id]
    );
  }

  function toggleGroup(id: string) {
    update(
      'groupIds',
      form.groupIds.includes(id)
        ? form.groupIds.filter((value) => value !== id)
        : [...form.groupIds, id]
    );
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!/\.md$/i.test(file.name) && !/\.markdown$/i.test(file.name)) {
      setFormError('Choose a Markdown file ending in .md.');
      return;
    }
    try {
      const text = await file.text();
      setForm((current) => ({
        ...current,
        sourceFileName: file.name,
        sourceMarkdown: text,
        title: current.title || file.name.replace(/\.(md|markdown)$/i, '').replace(/[-_]+/g, ' '),
      }));
      setFormError(null);
    } catch {
      setFormError('The file could not be read. Please try another file.');
    }
  }

  function validate(publish: boolean): string | null {
    if (form.title.trim().length < 3) return 'Enter a checkpoint title.';
    if (!form.sourceMarkdown.trim()) return 'Upload or paste the Markdown question paper.';
    if (!preview || preview.questions.length === 0) {
      return 'The Markdown file needs at least one question heading, for example "## Question 1".';
    }
    const duration = Number(form.durationMinutes);
    if (!Number.isFinite(duration) || duration < 1) return 'Enter a duration in minutes.';
    const total = Number(form.totalMarks);
    const passing = Number(form.passingMarks);
    if (!Number.isFinite(total) || total < 1) return 'Enter total marks.';
    if (!Number.isFinite(passing) || passing < 1 || passing > total) {
      return 'Passing marks must be between 1 and the total marks.';
    }
    if (preview.totalQuestionMarks > total) {
      return `The questions total ${preview.totalQuestionMarks} marks, which is more than the total marks.`;
    }
    if (publish && !buildStartAt(form.startDate, form.startTime)) {
      return 'Choose a start date before scheduling the checkpoint.';
    }
    if (publish && selectedTraineeCount === 0) {
      return 'Assign at least one trainee or group before scheduling.';
    }
    return null;
  }

  async function handleSave(publish: boolean) {
    const validation = validate(publish);
    if (validation) {
      setFormError(validation);
      return;
    }

    const body: CreateCheckpointRequest = {
      title: form.title.trim(),
      description: form.description.trim(),
      durationMinutes: Number(form.durationMinutes),
      totalMarks: Number(form.totalMarks),
      passingMarks: Number(form.passingMarks),
      startAt: buildStartAt(form.startDate, form.startTime),
      maxAttempts: Number(form.maxAttempts),
      allowEarlySubmission: form.allowEarlySubmission,
      allowLateEntry: form.allowLateEntry,
      resultVisibility: form.resultVisibility,
      sourceFileName: form.sourceFileName,
      sourceMarkdown: form.sourceMarkdown,
      traineeIds: form.traineeIds,
      groupIds: form.groupIds,
    };

    setSaving(true);
    setFormError(null);
    try {
      const saved = savedId
        ? await updateManagerCheckpoint(savedId, body)
        : await createManagerCheckpoint(body);
      if (!savedId) setSavedId(saved.id);

      if (publish) {
        await publishManagerCheckpoint(saved.id);
        onSaved(`"${saved.title}" is scheduled.`);
      } else {
        onSaved(`"${saved.title}" was saved as a draft.`);
      }
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not save the checkpoint.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="checkpoint-form-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h2 id="checkpoint-form-title" className={styles.title}>
              {target.mode === 'create' ? 'New checkpoint' : 'Edit checkpoint'}
            </h2>
            <p className={styles.subtitle}>
              The Markdown paper is parsed on the server. Each question starts with a heading such
              as <code>## Question 1: Title</code>.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        {loading ? (
          <div className={styles.loading}>Loading checkpoint…</div>
        ) : (
          <div className={styles.body}>
            <div className={styles.column}>
              <section className={styles.section}>
                <h3>Details</h3>
                <label className={styles.field}>
                  <span>Title</span>
                  <input
                    value={form.title}
                    onChange={(event) => update('title', event.target.value)}
                    placeholder="JavaScript checkpoint 1"
                    maxLength={160}
                  />
                </label>
                <label className={styles.field}>
                  <span>Description</span>
                  <textarea
                    value={form.description}
                    onChange={(event) => update('description', event.target.value)}
                    rows={2}
                    placeholder="What this checkpoint covers"
                  />
                </label>
                <div className={styles.grid3}>
                  <label className={styles.field}>
                    <span>Duration (minutes)</span>
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={form.durationMinutes}
                      onChange={(event) => update('durationMinutes', event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Total marks</span>
                    <input
                      type="number"
                      min={1}
                      value={form.totalMarks}
                      onChange={(event) => update('totalMarks', event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Passing marks</span>
                    <input
                      type="number"
                      min={1}
                      value={form.passingMarks}
                      onChange={(event) => update('passingMarks', event.target.value)}
                    />
                  </label>
                </div>

                <div className={styles.grid2}>
                  <label className={styles.field}>
                    <span>Start date</span>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(event) => update('startDate', event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Start time</span>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(event) => update('startTime', event.target.value)}
                    />
                  </label>
                </div>

                <div className={styles.grid2}>
                  <label className={styles.field}>
                    <span>Maximum attempts</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={form.maxAttempts}
                      onChange={(event) => update('maxAttempts', event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Results visibility</span>
                    <select
                      value={form.resultVisibility}
                      onChange={(event) =>
                        update(
                          'resultVisibility',
                          event.target.value as FormState['resultVisibility']
                        )
                      }
                    >
                      <option value="AFTER_APPROVAL">After manager publishes</option>
                      <option value="IMMEDIATE">As soon as graded</option>
                    </select>
                  </label>
                </div>

                <div className={styles.toggleGrid}>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={form.allowEarlySubmission}
                      onChange={(event) => update('allowEarlySubmission', event.target.checked)}
                    />
                    <span>
                      Allow early submission
                      <small>Trainees can submit before the deadline.</small>
                    </span>
                  </label>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={form.allowLateEntry}
                      onChange={(event) => update('allowLateEntry', event.target.checked)}
                    />
                    <span>
                      Allow late entry
                      <small>Otherwise entry closes 10 minutes after the start time.</small>
                    </span>
                  </label>
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3>Question paper</h3>
                  <button
                    type="button"
                    className={styles.uploadButton}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={15} aria-hidden="true" />
                    Upload .md
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.markdown,text/markdown"
                    hidden
                    onChange={(event) => {
                      void handleFile(event.target.files?.[0] ?? null);
                      event.target.value = '';
                    }}
                  />
                </div>
                {form.sourceFileName && (
                  <p className={styles.fileName}>
                    <FileText size={14} aria-hidden="true" />
                    {form.sourceFileName}
                  </p>
                )}
                <textarea
                  className={styles.markdownInput}
                  value={form.sourceMarkdown}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      sourceMarkdown: event.target.value,
                      sourceFileName: current.sourceFileName,
                    }))
                  }
                  rows={14}
                  spellCheck={false}
                  placeholder={`# Checkpoint title\n\nInstructions for trainees.\n\n## Question 1: First question\nMarks: 10\n\nYour question here.\n\n## Question 2: SQL task\nType: sql\nMarks: 5\n\nWrite a query…`}
                />
                <p className={styles.helpText}>
                  Supported metadata: <code>Type</code>, <code>Marks</code>, <code>Language</code>,{' '}
                  <code>Choices</code>, <code>Correct</code>. For practical tasks also{' '}
                  <code>Runtime</code> (node, browser or sql), <code>Run</code> and{' '}
                  <code>Setup-sql</code>. Add starter files as fenced blocks tagged{' '}
                  <code>file=path</code>, and setup SQL with <code>setup</code>. Write metadata as
                  plain lines, a bracketed line, or an HTML comment under the heading.
                </p>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3>Assign to trainees and groups</h3>
                  <span className={styles.count}>{selectedTraineeCount} trainee(s) covered</span>
                </div>
                <input
                  className={styles.search}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search trainees…"
                  aria-label="Search trainees"
                />

                {groups.length > 0 && (
                  <div className={styles.groupList}>
                    <p className={styles.groupHeading}>Groups</p>
                    {groups.map((group) => (
                      <label key={group.id} className={styles.assignmentRow}>
                        <input
                          type="checkbox"
                          checked={form.groupIds.includes(group.id)}
                          onChange={() => toggleGroup(group.id)}
                        />
                        <span>
                          {group.name}
                          <small>{group.members.length} member(s)</small>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                <p className={styles.groupHeading}>Individual trainees</p>
                <div className={styles.traineeList}>
                  {filteredTrainees.length === 0 ? (
                    <p className={styles.muted}>No trainees match that search.</p>
                  ) : (
                    filteredTrainees.map((trainee) => (
                      <label key={trainee.id} className={styles.assignmentRow}>
                        <input
                          type="checkbox"
                          checked={form.traineeIds.includes(trainee.id)}
                          onChange={() => toggleTrainee(trainee.id)}
                        />
                        <span>
                          {trainee.name}
                          <small>{trainee.email}</small>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </section>
            </div>

            <aside className={styles.previewColumn} aria-label="Markdown preview">
              <div className={styles.previewHeader}>
                <h3>Parsed preview</h3>
                {previewBusy && <span className={styles.previewBusy}>Parsing…</span>}
              </div>

              {visiblePreviewError && <p className={styles.error}>{visiblePreviewError}</p>}

              {!visiblePreview && !visiblePreviewError ? (
                <p className={styles.muted}>
                  Upload a Markdown file or paste the paper to see the parsed instructions and
                  questions.
                </p>
              ) : (
                visiblePreview && (
                  <>
                    <div className={styles.previewSummary}>
                      <span>{visiblePreview.questions.length} question(s)</span>
                      <span>{visiblePreview.totalQuestionMarks} question marks</span>
                    </div>
                    {visiblePreview.suggestedTitle && (
                      <p className={styles.suggestedTitle}>
                        Paper title: <strong>{visiblePreview.suggestedTitle}</strong>
                      </p>
                    )}
                    {visiblePreview.warnings.length > 0 && (
                      <ul className={styles.warnings}>
                        {visiblePreview.warnings.map((warning, index) => (
                          <li key={`${warning}-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    )}
                    <div className={styles.previewScroll}>
                      <section className={styles.previewSection}>
                        <h4>Instructions</h4>
                        {visiblePreview.instructionsMarkdown ? (
                          <MarkdownRenderer markdown={visiblePreview.instructionsMarkdown} />
                        ) : (
                          <p className={styles.muted}>No instructions before the first question.</p>
                        )}
                      </section>
                      {visiblePreview.questions.map((question) => (
                        <article key={question.orderIndex} className={styles.previewQuestion}>
                          <div className={styles.previewQuestionHeader}>
                            <span>Question {question.orderIndex}</span>
                            <span className={styles.questionType}>
                              {questionTypeLabel(question.type)}
                            </span>
                            <span className={styles.questionMarks}>{question.marks} marks</span>
                          </div>
                          <h5>{question.title}</h5>
                          <MarkdownRenderer markdown={question.promptMarkdown} />
                          {question.type === 'PRACTICAL' && (
                            <p className={styles.muted}>
                              Runtime: {question.runtime ?? 'node'}
                              {question.runCommand ? ` · Run: ${question.runCommand}` : ''}
                              {question.starterFiles
                                ? ` · ${question.starterFiles.length} starter file(s)`
                                : ''}
                            </p>
                          )}
                          {question.options && (
                            <ul className={styles.options}>
                              {question.options.map((option, index) => (
                                <li key={option}>
                                  {String.fromCharCode(65 + index)}. {option}
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>
                      ))}
                    </div>
                  </>
                )
              )}
            </aside>
          </div>
        )}

        {formError && (
          <p className={`${styles.error} ${styles.formError}`} role="alert">
            {formError}
          </p>
        )}

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleSave(false)}
              disabled={saving || loading}
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleSave(true)}
              disabled={saving || loading}
            >
              {saving ? 'Saving…' : 'Save & schedule'}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
