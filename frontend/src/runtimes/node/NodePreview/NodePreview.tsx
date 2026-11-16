import { useState } from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import { CREDENTIALLESS_IFRAME } from '../../previewFrameAttributes';
import styles from './NodePreview.module.css';

type NodePreviewProps = { url: string; port: number };

export default function NodePreview({ url, port }: NodePreviewProps) {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className={styles.preview}>
      <div className={styles.toolbar}>
        <Globe size={14} aria-hidden="true" />
        <span className={styles.address}>localhost:{port}</span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Reload preview"
          title="Reload preview"
          onClick={() => setReloadKey((key) => key + 1)}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
      </div>
      {/* The dev server is a separate origin (loopback + its own port), so it needs no
          sandbox. The credentialless opt-in is required by the app's COEP policy. */}
      <iframe
        {...CREDENTIALLESS_IFRAME}
        key={reloadKey}
        className={styles.frame}
        src={url}
        allow="cross-origin-isolated"
        title={'Server on port ' + port}
      />
    </div>
  );
}
