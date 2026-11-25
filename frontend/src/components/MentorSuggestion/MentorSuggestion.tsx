import { MessageSquareText } from 'lucide-react';
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer';
import styles from './MentorSuggestion.module.css';

type MentorSuggestionProps = {
  adminName: string;
  feedback: string;
  compact?: boolean;
};

export default function MentorSuggestion({
  adminName,
  feedback,
  compact = false,
}: MentorSuggestionProps) {
  if (!feedback.trim()) return null;

  if (compact) {
    return (
      <span className={`${styles.suggestion} ${styles.compact}`}>
        <MessageSquareText size={14} aria-hidden="true" />
        <span className={styles.compactText}>
          <strong>Mentor suggestion:</strong> {feedback}
        </span>
      </span>
    );
  }

  return (
    <aside className={styles.suggestion} aria-label="Mentor suggestion">
      <div className={styles.heading}>
        <MessageSquareText size={18} aria-hidden="true" />
        <div>
          <h2 className={styles.title}>Mentor suggestion</h2>
          <p className={styles.attribution}>Optional guidance from {adminName || 'your mentor'}</p>
        </div>
      </div>
      <MarkdownRenderer markdown={feedback} className={styles.content} />
    </aside>
  );
}
