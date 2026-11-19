import { useEffect, useRef, useState } from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import styles from './NodePreview.module.css';

type NodePreviewProps = { url: string; port: number };

export default function NodePreview({ url, port }: NodePreviewProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;

      setDimensions({
        width: Math.round(width),
        height: Math.round(height),
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={previewRef} className={styles.preview}>
      <div className={styles.toolbar}>
        <Globe size={14} aria-hidden="true" />
        <span className={styles.address}>localhost:{port}</span>

        <span className={styles.dimensions}>
          {dimensions.width} × {dimensions.height}
        </span>

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

      <iframe
        key={reloadKey}
        className={styles.frame}
        src={url}
        allow="cross-origin-isolated"
        title={`Server on port ${port}`}
      />
    </div>
  );
}
