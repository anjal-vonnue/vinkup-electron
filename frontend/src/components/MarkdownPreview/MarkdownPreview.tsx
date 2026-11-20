import { useDeferredValue } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components, Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import { Link as LinkIcon } from 'lucide-react';
import MermaidDiagram from '../MermaidDiagram';
import styles from './MarkdownPreview.module.css';

type MarkdownPreviewProps = {
  source: string;
};

/*
 * GitHub-flavoured Markdown:
 *  - remark-gfm: tables, task lists, strikethrough, autolinks, footnotes
 *  - rehype-raw + rehype-sanitize: inline HTML (<details>, <kbd>, <img align>...) through
 *    GitHub's own allow-list, so scripts and event handlers are removed
 *  - rehype-slug: heading ids (sanitize adds GitHub's "user-content-" prefix, so a heading id
 *    can never collide with an id in the app itself)
 *  - rehype-highlight: syntax highlighting; it runs after sanitize, which would strip its classes
 *  - ```mermaid blocks: drawn as diagrams by MermaidDiagram (Mermaid is loaded on first use)
 */
const remarkPlugins: Options['remarkPlugins'] = [remarkGfm];

const rehypePlugins: Options['rehypePlugins'] = [
  rehypeRaw,
  rehypeSlug,
  rehypeSanitize,
  [rehypeHighlight, { ignoreMissing: true }],
];

const EXTERNAL_LINK = /^(https?:|mailto:)/i;

type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

/** The diagram text when this <pre> is a ```mermaid block, otherwise null. */
function mermaidSource(pre: unknown): string | null {
  const code = (pre as HastNode | undefined)?.children?.find(
    (child) => child.type === 'element' && child.tagName === 'code'
  );
  const classes = code?.properties?.className;

  if (!code || !Array.isArray(classes) || !classes.includes('language-mermaid')) return null;

  return textOf(code).replace(/\n$/, '');
}

/** react-markdown passes the syntax-tree `node` to every component; it must not reach the DOM. */
function withoutNode<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const { node, ...rest } = props;
  void node;
  return rest;
}

/** Scrolls to a heading inside the preview; never changes the app's own URL. */
function scrollToAnchor(from: HTMLElement, hash: string): void {
  const root = from.closest('article');
  if (!root) return;

  let wanted = hash.replace(/^#/, '');
  try {
    wanted = decodeURIComponent(wanted);
  } catch {
    // keep the text as written
  }
  wanted = wanted.replace(/^user-content-/, '');

  const target = Array.from(root.querySelectorAll<HTMLElement>('[id]')).find(
    (element) => element.id.replace(/^user-content-/, '') === wanted
  );

  target?.scrollIntoView({ block: 'start' });
}

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

function heading(Tag: HeadingTag) {
  return function Heading(props: ComponentPropsWithoutRef<HeadingTag> & { node?: unknown }) {
    const { id, children, ...rest } = withoutNode(props);

    return (
      <Tag id={id} {...rest}>
        {id && (
          <a
            className={styles.anchor}
            href={`#${id}`}
            aria-label="Permalink"
            onClick={(event) => {
              event.preventDefault();
              scrollToAnchor(event.currentTarget, id);
            }}
          >
            <LinkIcon size={16} aria-hidden="true" />
          </a>
        )}
        {children}
      </Tag>
    );
  };
}

const components: Components = {
  h1: heading('h1'),
  h2: heading('h2'),
  h3: heading('h3'),
  h4: heading('h4'),
  h5: heading('h5'),
  h6: heading('h6'),

  a(props) {
    const { href, children, ...rest } = withoutNode(props);

    if (href?.startsWith('#')) {
      return (
        <a
          {...rest}
          href={href}
          onClick={(event) => {
            event.preventDefault();
            scrollToAnchor(event.currentTarget, href);
          }}
        >
          {children}
        </a>
      );
    }

    if (href && EXTERNAL_LINK.test(href)) {
      return (
        <a {...rest} href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    }

    // A relative link would navigate the app's own window, so it does nothing here.
    return (
      <a {...rest} href={href} onClick={(event) => event.preventDefault()}>
        {children}
      </a>
    );
  },

  img(props) {
    const { alt, ...rest } = withoutNode(props);
    return <img alt={alt ?? ''} loading="lazy" {...rest} />;
  },

  // ```mermaid blocks are drawn as diagrams; every other code block stays as code.
  pre(props) {
    const source = mermaidSource(props.node);

    if (source !== null) return <MermaidDiagram source={source} />;

    return <pre {...withoutNode(props)} />;
  },

  // Wide tables scroll sideways inside their own box instead of widening the page.
  table(props) {
    return (
      <div className={styles.tableWrap}>
        <table {...withoutNode(props)} />
      </div>
    );
  },
};

export default function MarkdownPreview({ source }: MarkdownPreviewProps) {
  // Keeps typing responsive in Split view: the preview catches up between keystrokes.
  const deferredSource = useDeferredValue(source);

  return (
    <div className={styles.root}>
      <article className={styles.markdown}>
        {deferredSource.trim() === '' ? (
          <p className={styles.empty}>Nothing to preview.</p>
        ) : (
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={components}
          >
            {deferredSource}
          </ReactMarkdown>
        )}
      </article>
    </div>
  );
}
