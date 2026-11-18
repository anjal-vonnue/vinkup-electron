import Prism from 'prismjs';
import React, { useRef } from 'react';
import { Link } from 'react-router';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-diff';

import { getDayReference } from '../../content/data/getDayReference';
import type { ContentBlock } from '../../content/types';
import styles from './ReferencePage.module.css';
import Header from '../../components/Header';
import ReferenceSearch from '../../components/ReferenceSearch';
import ScrollToTopButton from '../../components/ScrollToTopButton';
import ArrowIcon from './assets/ArrowIcon';

type ReferencePageProps = {
  dayId: string;
};

/* Topics shown as accordions (one closed item per sub-heading) */
const COLLAPSIBLE_TOPIC_IDS = new Set([
  'nodefspromises',
  'nodehttpclientrequest',
  'nodehttpserver',
  'nodehttpserverresponse',
]);

const renderToken = (token: Prism.Token | string, key: string): React.ReactNode => {
  if (typeof token === 'string') {
    return token;
  }

  const content = Array.isArray(token.content)
    ? token.content.map((item, index) => renderToken(item, `${key}-${index}`))
    : renderToken(token.content, `${key}-content`);

  return (
    <span key={key} className={`token ${token.type}`}>
      {content}
    </span>
  );
};

const getHighlightedCode = (code: string, language: string) => {
  const normalizedLanguage = language
    .toLowerCase()
    .replace('-nolint', '')
    .replace('-live-sample', '');

  const grammar =
    normalizedLanguage === 'html' || normalizedLanguage === 'markup'
      ? Prism.languages.markup
      : (Prism.languages[normalizedLanguage] ?? Prism.languages.markup);

  return Prism.tokenize(code, grammar);
};

/* Splits blocks at the shallowest sub-heading level */
function groupBySubheading(blocks: ContentBlock[]) {
  const levels = blocks.flatMap((block) => (block.type === 'subheading' ? [block.level] : []));

  if (levels.length === 0) {
    return { intro: blocks, groups: [] as { title: string; blocks: ContentBlock[] }[] };
  }

  const groupLevel = Math.min(...levels);
  const intro: ContentBlock[] = [];
  const groups: { title: string; blocks: ContentBlock[] }[] = [];

  for (const block of blocks) {
    if (block.type === 'subheading' && block.level === groupLevel) {
      groups.push({ title: block.text, blocks: [] });
    } else if (groups.length === 0) {
      intro.push(block);
    } else {
      groups[groups.length - 1].blocks.push(block);
    }
  }

  return { intro, groups };
}

const renderBlock = (block: ContentBlock, index: number): React.ReactNode => {
  /* Paragraph */
  if (block.type === 'paragraph') {
    return (
      <p key={index} className={styles.paragraph}>
        {block.text}
      </p>
    );
  }

  if (block.type === 'htmlTable') {
    return (
      <div key={`html-table-${index}`} className={styles.htmlTableWrapper}>
        <div className={styles.htmlTable} dangerouslySetInnerHTML={{ __html: block.html }} />
      </div>
    );
  }

  /* Definitions */
  if (block.type === 'definitions') {
    return (
      <dl key={index} className={styles.definitions}>
        {block.items.map((item, itemIndex) => (
          <div key={itemIndex} className={styles.definitionItem}>
            <dt className={styles.definitionTerm}>{item.term}</dt>
            <dd className={styles.definitionDescription}>{item.description}</dd>
          </div>
        ))}
      </dl>
    );
  }

  /* Table */
  if (block.type === 'table') {
    return (
      <div key={index} className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              {block.headers.map((header, headerIndex) => (
                <th key={headerIndex}>{header}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>
                    {cell.startsWith('`') && cell.endsWith('`') ? (
                      <code className={styles.inlineCode}>
                        {getHighlightedCode(cell.slice(1, -1), 'html').map((token, tokenIndex) =>
                          renderToken(token, `table-token-${rowIndex}-${cellIndex}-${tokenIndex}`)
                        )}
                      </code>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /* Subheading */
  if (block.type === 'subheading') {
    if (block.level === 3) {
      return (
        <h3 key={index} className={styles.subheading}>
          {block.text}
        </h3>
      );
    }

    if (block.level === 4) {
      return (
        <h4 key={index} className={styles.subheading}>
          {block.text}
        </h4>
      );
    }

    if (block.level === 5) {
      return (
        <h5 key={index} className={styles.subheading}>
          {block.text}
        </h5>
      );
    }

    return (
      <h6 key={index} className={styles.subheading}>
        {block.text}
      </h6>
    );
  }

  /* Image */
  if (block.type === 'image') {
    return (
      <figure key={index} className={styles.imageFigure}>
        <img src={block.src} alt={block.alt} className={styles.contentImage} />

        {block.alt && <figcaption className={styles.imageCaption}>{block.alt}</figcaption>}
      </figure>
    );
  }

  /* Code */
  if (block.type === 'code') {
    return (
      <div key={index} className={styles.codeBlock}>
        <div className={styles.codeHeader}>
          <div className={styles.windowDots}>
            <span />
            <span />
            <span />
          </div>

          <span className={styles.codeFilename}>{block.code.filename || 'code'}</span>

          <span className={styles.codeLanguage}>{block.code.language || 'CODE'}</span>
        </div>

        <pre>
          <code>
            {getHighlightedCode(block.code.code, block.code.language).map((token, tokenIndex) =>
              renderToken(token, `token-${tokenIndex}`)
            )}
          </code>
        </pre>
      </div>
    );
  }

  /* List */
  if (block.type === 'list') {
    const ListTag = block.ordered ? 'ol' : 'ul';

    return (
      <ListTag key={index} className={styles.list} start={block.ordered ? block.start : undefined}>
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{item}</li>
        ))}
      </ListTag>
    );
  }

  /* Callout */
  if (block.type === 'callout') {
    const calloutClass =
      block.callout.variant === 'warning' ? styles.warningCallout : styles.infoCallout;

    return (
      <aside key={index} className={calloutClass}>
        <strong>{block.callout.title}</strong>
        <p>{block.callout.body}</p>
      </aside>
    );
  }

  return null;
};

const renderVideos = (videos: { title: string; embedUrl: string }[]) => (
  <section className={styles.videoSection}>
    <h2>Video</h2>

    {videos.map((video) => (
      <div key={video.embedUrl} className={styles.videoCard}>
        <h3 className={styles.videoTitle}>{video.title}</h3>

        <iframe
          className={styles.videoFrame}
          src={video.embedUrl}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    ))}
  </section>
);

const ReferencePage = ({ dayId }: ReferencePageProps) => {
  const contentRef = useRef<HTMLDivElement>(null); // must stay above the early return
  const content = getDayReference(dayId);

  if (!content) {
    return (
      <main className={styles.page}>
        <p className={styles.error}>No reference content found for this day.</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Header />

      <div className={styles.contentWrapper}>
        <div className={styles.toolbar}>
          <Link to={`/days/${dayId}`} className={styles.backLink}>
            <ArrowIcon direction="left" />
            <span>Back to day overview</span>
          </Link>

          <ReferenceSearch containerRef={contentRef} contentKey={dayId} />
        </div>

        <div ref={contentRef} className={styles.referenceContainer}>
          {content.instruction && (
            <div className={styles.instructionBox}>{content.instruction}</div>
          )}
          {content.videoAtStart && content.videos?.length ? renderVideos(content.videos) : null}

          {/* Prerequisite links (e.g. Node Day 5) */}
          {content.prerequisiteLinks?.length ? (
            <section className={styles.prerequisites}>
              <p className={styles.paragraph}>
                The following references cover the concepts required for this day&apos;s task.
                Review these materials before proceeding.
              </p>

              <ul className={styles.prerequisiteList}>
                {content.prerequisiteLinks.map((link) => (
                  <li key={link.dayId} className={styles.prerequisiteItem}>
                    <span className={styles.prerequisiteLabel}>{link.label}</span>

                    <Link
                      to={`/days/${link.dayId}/references`}
                      className={`${styles.returnButton} ${styles.prerequisiteButton}`}
                    >
                      <span>View References</span>
                      <ArrowIcon direction="right" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Reference Sections */}
          {content.sections.map((section) => {
            const isCollapsible = COLLAPSIBLE_TOPIC_IDS.has(section.id);
            const grouped = isCollapsible ? groupBySubheading(section.blocks) : null;

            return (
              <React.Fragment key={section.id}>
                <section className={styles.referenceSection}>
                  <h2 className={styles.sectionTitle}>
                    <span className={styles.sectionAccent} />

                    <span>
                      {section.number}. {section.heading}
                    </span>
                  </h2>

                  {grouped ? (
                    <>
                      {grouped.intro.map(renderBlock)}

                      {grouped.groups.map((group, groupIndex) => (
                        <details key={groupIndex} className={styles.accordion}>
                          <summary className={styles.accordionSummary}>{group.title}</summary>

                          <div className={styles.accordionBody}>
                            {group.blocks.map(renderBlock)}
                          </div>
                        </details>
                      ))}
                    </>
                  ) : (
                    section.blocks.map(renderBlock)
                  )}
                </section>

                {content.videoAfterTopicId === section.id && content.videos?.length
                  ? renderVideos(content.videos)
                  : null}
              </React.Fragment>
            );
          })}

          {/* Return to Day */}
          <Link to={`/days/${dayId}`} className={styles.returnButton}>
            <ArrowIcon direction="left" />
            <span>Return to Day {content.dayNumber}</span>
          </Link>
        </div>
      </div>

      <ScrollToTopButton />
    </main>
  );
};

export default ReferencePage;
