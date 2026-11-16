import type { RefObject } from 'react';
import { CREDENTIALLESS_IFRAME } from '../../previewFrameAttributes';
import { PREVIEW_SANDBOX } from '../previewPolicy';
import styles from './PreviewFrame.module.css';

type PreviewFrameProps = {
  runId: string;
  entryPath: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
} & ({ srcdoc: string } | { src: string });

export default function PreviewFrame(props: PreviewFrameProps) {
  const { runId, entryPath, iframeRef } = props;
  return (
    <iframe
      {...CREDENTIALLESS_IFRAME}
      // A new key per run gives every run a fresh page (no leftover timers or listeners).
      key={runId}
      ref={iframeRef}
      className={styles.frame}
      {...('srcdoc' in props ? { srcDoc: props.srcdoc } : { src: props.src })}
      // Never add allow-same-origin (see previewPolicy.ts).
      sandbox={PREVIEW_SANDBOX}
      referrerPolicy="no-referrer"
      title={'Preview of ' + entryPath}
    />
  );
}
