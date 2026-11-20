import { useEffect, useState } from 'react';
import { useAppTheme } from '../../hooks/useAppTheme';
import styles from './MermaidDiagram.module.css';

type MermaidDiagramProps = {
  source: string;
};

type DiagramState = {
  /** The last diagram that drew successfully; kept while the text has a typo. */
  svg: string | null;
  error: string | null;
};

let diagramCounter = 0;

/**
 * Draws a ```mermaid block. Mermaid is loaded on first use (it is large), so previews that
 * contain no diagrams never download it.
 */
export default function MermaidDiagram({ source }: MermaidDiagramProps) {
  const isDark = useAppTheme();
  const [state, setState] = useState<DiagramState>({ svg: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const id = `itp-mermaid-${++diagramCounter}`;

    async function draw() {
      try {
        const { default: mermaid } = await import('mermaid');

        // 'strict' makes Mermaid sanitise labels and ignore embedded HTML and scripts.
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: isDark ? 'dark' : 'default',
          fontFamily: 'inherit',
        });

        // Throws on a syntax error, without leaving an error graphic in the page.
        await mermaid.parse(source);

        const { svg } = await mermaid.render(id, source);

        if (!cancelled) setState({ svg, error: null });
      } catch (error) {
        // A failed render can leave its temporary element in the page.
        document.getElementById(`d${id}`)?.remove();

        if (!cancelled) {
          setState((current) => ({
            svg: current.svg,
            error: error instanceof Error ? error.message : 'The diagram could not be drawn.',
          }));
        }
      }
    }

    void draw();

    return () => {
      cancelled = true;
    };
  }, [source, isDark]);

  const isLoading = state.svg === null && state.error === null;

  return (
    <figure className={styles.figure}>
      {isLoading && (
        <p className={styles.status} role="status">
          Drawing diagram…
        </p>
      )}

      {state.svg !== null && (
        <div
          className={state.error ? `${styles.diagram} ${styles.stale}` : styles.diagram}
          role="img"
          aria-label="Diagram"
          // The SVG comes from Mermaid's own renderer with securityLevel "strict", which
          // sanitises everything the Markdown author wrote.

          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      )}

      {state.error !== null && (
        <pre className={styles.error} role="status">
          {state.error}
        </pre>
      )}

      <details className={styles.source}>
        <summary>Diagram source</summary>
        <pre>
          <code>{source}</code>
        </pre>
      </details>
    </figure>
  );
}
