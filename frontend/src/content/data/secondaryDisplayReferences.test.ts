import { describe, expect, it } from 'vitest';
import { dayReferences } from './dayReferences';
import { secondaryDisplayReferences } from './secondaryDisplayReferences';

describe('secondaryDisplayReferences', () => {
  it('resolves every configured day with its course and day title', () => {
    expect(secondaryDisplayReferences).toHaveLength(dayReferences.length);
    expect(secondaryDisplayReferences.map(({ id }) => id)).toEqual(
      dayReferences.map(({ id }) => id)
    );
    expect(
      secondaryDisplayReferences.every(
        ({ title, courseLabel, dayNumber }) =>
          title.length > 0 && courseLabel.length > 0 && dayNumber > 0
      )
    ).toBe(true);
  });

  it('preserves prerequisite-only days and their navigation references', () => {
    const nodeAssessment = secondaryDisplayReferences.find(({ id }) => id === 'node-day-05');

    expect(nodeAssessment?.sections).toEqual([]);
    expect(nodeAssessment?.prerequisiteLinks).toHaveLength(2);
  });

  it('keeps reference videos available to the secondary reader', () => {
    const htmlDayOne = secondaryDisplayReferences.find(({ id }) => id === 'html-day-01');

    expect(htmlDayOne?.videoAtStart).toBe(true);
    expect(htmlDayOne?.videos?.[0]?.embedUrl).toContain('youtube.com/embed/');
  });

  it('rewrites local reference image paths to packaged overlay assets', () => {
    const sections = secondaryDisplayReferences.flatMap(({ sections }) => sections);
    const image = sections
      .flatMap(({ blocks }) => blocks)
      .find((block) => block.type === 'image' && block.src.startsWith('./reference-assets/'));

    expect(image).toBeDefined();
  });
});
