/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Load a stylesheet as one line, so assertions ignore formatting. */
function css(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8').replace(/\s+/g, ' ');
}

describe('print styles', () => {
  it('keeps the report off the screen and lays it out on A4 paper', () => {
    const report = css('../../components/PrintReport/PrintReport.module.css');

    expect(report).toContain('@media screen { .report { display: none; } }');
    expect(report).toContain('@page { size: A4;');
    expect(report).toContain('@bottom-left');
    expect(report).toContain("counter(page) ' of ' counter(pages)");
    expect(report).toContain('print-color-adjust: exact');
    expect(report).toContain('break-after: avoid');
  });

  it('prints a light document even when the app is in the dark theme', () => {
    const report = css('../../components/PrintReport/PrintReport.module.css');

    expect(report).toContain('--color-text-primary: #14162a');
    expect(report).toContain('background: #ffffff');
    expect(report).toContain('color: #14162a');
    expect(report).toContain('color-scheme: light !important');
  });

  it('lets a tall card flow over a page break instead of clipping it', () => {
    const report = css('../../components/PrintReport/PrintReport.module.css');

    expect(report).toContain('.card { break-inside: auto; }');

    expect(report).toContain('.tableCard { break-inside: auto; }');

    expect(report).toContain('overflow-wrap: anywhere');
    expect(report).toContain('orphans: 3');
  });

  it('hides the on-screen page while printing', () => {
    const page = css('./AdminTraineePage.module.css');

    expect(page).toContain('@media print { .screenOnly { display: none !important; } }');
  });
});
