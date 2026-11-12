import { useEffect, useRef } from 'react';
import MarkdownRenderer from '../MarkdownRenderer';
import { blockCopyEvents } from '../../lib/blockCopyEvents';
import styles from './InstructionsPanel.module.css';

type InstructionsPanelProps = {
  markdown: string;
};

export default function InstructionsPanel({ markdown }: InstructionsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  //block copying instruction text while the panel is on screen.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    return blockCopyEvents(panel);
  }, []);

  return (
    <div ref={panelRef}>
      <MarkdownRenderer markdown={markdown} className={styles.instructions} />
    </div>
  );
}
