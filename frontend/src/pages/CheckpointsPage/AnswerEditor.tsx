import { useId, useState } from 'react';
import type { CheckpointFileInput, CheckpointQuestion, CheckpointWorkspaceFile } from '@itp/types';
import Editor from '@monaco-editor/react';
import { FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import '../../lib/monacoSetup';
import type { DraftAnswer } from './useCheckpointAutosave';
import { readDeliverableFile } from './answerUtils';
import PracticalWorkspace from './PracticalWorkspace';
import styles from './AnswerEditor.module.css';

function formatBytes(size: number | null): string {
  if (size === null) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function monacoLanguage(question: CheckpointQuestion): string {
  if (question.type === 'SQL') return 'sql';
  return question.codeLanguage || 'javascript';
}

type Props = {
  question: CheckpointQuestion;
  draft: DraftAnswer | undefined;
  disabled: boolean;
  workspaceId: string;
  onChangeText: (text: string) => void;
  onSelectOption: (option: string) => void;
  onAttachFile: (file: CheckpointFileInput) => void;
  onRemoveFile: () => void;
  onChangeFiles: (files: CheckpointWorkspaceFile[]) => void;
  onSaveFiles: () => void;
  onFileError: (message: string) => void;
};

export default function AnswerEditor({
  question,
  draft,
  disabled,
  workspaceId,
  onChangeText,
  onSelectOption,
  onAttachFile,
  onRemoveFile,
  onChangeFiles,
  onSaveFiles,
  onFileError,
}: Props) {
  const fileInputId = useId();
  const [fileBusy, setFileBusy] = useState(false);

  const answerText = draft?.answerText ?? '';

  async function handleFile(file: File | null) {
    if (!file) return;
    setFileBusy(true);
    try {
      const payload = await readDeliverableFile(file);
      onAttachFile(payload);
    } catch (error) {
      onFileError(error instanceof Error ? error.message : 'The file could not be read.');
    } finally {
      setFileBusy(false);
    }
  }

  if (question.type === 'PRACTICAL') {
    return (
      <PracticalWorkspace
        key={question.id}
        question={question}
        initialFiles={draft?.files ?? question.starterFiles ?? []}
        submittedFiles={draft?.files ?? null}
        workspaceId={workspaceId}
        disabled={disabled}
        onFilesChange={onChangeFiles}
        onSave={onSaveFiles}
      />
    );
  }

  if (question.type === 'MULTIPLE_CHOICE') {
    const options = question.options ?? [];
    return (
      <div
        className={styles.options}
        role="radiogroup"
        aria-label={`Options for ${question.title}`}
      >
        {options.map((option, index) => {
          const checked = draft?.selectedOption === option;
          return (
            <label
              key={`${option}-${index}`}
              className={`${styles.option} ${checked ? styles.optionSelected : ''} ${
                disabled ? styles.optionDisabled : ''
              }`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={option}
                checked={checked}
                disabled={disabled}
                onChange={() => onSelectOption(option)}
              />
              <span className={styles.optionLetter}>{String.fromCharCode(65 + index)}</span>
              <span className={styles.optionText}>{option}</span>
            </label>
          );
        })}
        {options.length === 0 && (
          <p className={styles.emptyOptions}>
            This question has no options. Ask your manager to check the paper.
          </p>
        )}
      </div>
    );
  }

  if (question.type === 'FILE') {
    return (
      <div className={styles.fileField}>
        {draft?.fileName ? (
          <div className={styles.fileChip}>
            <FileText size={18} aria-hidden="true" />
            <div className={styles.fileMeta}>
              <span className={styles.fileName}>{draft.fileName}</span>
              <span className={styles.fileSize}>{formatBytes(draft.fileSize)}</span>
            </div>
            {!disabled && (
              <button
                type="button"
                className={styles.removeFile}
                onClick={onRemoveFile}
                aria-label={`Remove ${draft.fileName}`}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ) : (
          <div className={styles.uploadBox}>
            <Paperclip size={20} aria-hidden="true" />
            <p>Attach your deliverable</p>
            <span>One file, up to 2 MB. You can replace it until you submit.</span>
            <label
              htmlFor={fileInputId}
              className={`${styles.uploadButton} ${disabled ? styles.uploadDisabled : ''}`}
            >
              <Upload size={15} aria-hidden="true" />
              {fileBusy ? 'Reading…' : 'Choose file'}
            </label>
            <input
              id={fileInputId}
              type="file"
              hidden
              disabled={disabled || fileBusy}
              onChange={(event) => {
                void handleFile(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />
          </div>
        )}
        {draft?.fileName && !disabled && (
          <label htmlFor={fileInputId} className={styles.replaceFile}>
            Replace file
            <input
              id={fileInputId}
              type="file"
              hidden
              disabled={fileBusy}
              onChange={(event) => {
                void handleFile(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />
          </label>
        )}
      </div>
    );
  }

  if (question.type === 'CODE' || question.type === 'SQL') {
    return (
      <div className={`${styles.codeField} ${disabled ? styles.codeDisabled : ''}`}>
        <div className={styles.codeHeader}>
          <span>{question.type === 'SQL' ? 'SQL' : monacoLanguage(question)}</span>
          <span>{question.type === 'SQL' ? 'Write your query' : 'Write your solution'}</span>
        </div>
        <Editor
          height="320px"
          language={monacoLanguage(question)}
          value={answerText}
          onChange={(value) => onChangeText(value ?? '')}
          options={{
            readOnly: disabled,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 10, bottom: 10 },
            renderLineHighlight: 'line',
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          }}
        />
      </div>
    );
  }

  const rows = question.type === 'LONG_TEXT' ? 10 : 4;
  return (
    <textarea
      className={styles.textarea}
      value={answerText}
      rows={rows}
      disabled={disabled}
      placeholder={
        question.type === 'LONG_TEXT' ? 'Write your answer in detail…' : 'Type your answer…'
      }
      onChange={(event) => onChangeText(event.target.value)}
    />
  );
}
