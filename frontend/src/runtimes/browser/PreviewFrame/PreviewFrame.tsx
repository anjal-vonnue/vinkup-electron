import type { IframeHTMLAttributes, RefObject } from 'react';
import { PREVIEW_SANDBOX } from '../previewPolicy';
import styles from './PreviewFrame.module.css';

type PreviewFrameProps = {
  runId: string;
  entryPath: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
} & ({ srcdoc: string } | { src: string });

// The app page is COEP: credentialless, which blocks cross-origin iframes unless
// the frame opts in with this Chromium attribute. It does not affect the sandbox.
const CREDENTIALLESS = {
  credentialless: true,
} as unknown as IframeHTMLAttributes<HTMLIFrameElement>;

export default function PreviewFrame(props: PreviewFrameProps) {
  const { runId, entryPath, iframeRef } = props;
  return (
    <iframe
      {...CREDENTIALLESS}
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
