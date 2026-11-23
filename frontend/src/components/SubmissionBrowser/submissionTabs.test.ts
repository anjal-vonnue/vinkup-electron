import { describe, expect, it } from 'vitest';
import { closeAllTabs, closeTab, initialTabs, INSTRUCTIONS_TAB, openTab } from './submissionTabs';

describe('submission tabs', () => {
  it('inserts a newly opened tab after the active tab', () => {
    const state = openTab(openTab(initialTabs, 'a.ts'), 'b.ts');

    expect(state.openPaths).toEqual([INSTRUCTIONS_TAB, 'a.ts', 'b.ts']);
    expect(state.activePath).toBe('b.ts');
  });

  it('only activates a tab that is already open', () => {
    const open = openTab(initialTabs, 'a.ts');

    expect(openTab(open, INSTRUCTIONS_TAB)).toEqual({
      openPaths: [INSTRUCTIONS_TAB, 'a.ts'],
      activePath: INSTRUCTIONS_TAB,
    });
  });

  it('keeps the active tab when a different tab is closed', () => {
    const state = openTab(openTab(initialTabs, 'a.ts'), 'b.ts');

    expect(closeTab(state, 'a.ts')).toEqual({
      openPaths: [INSTRUCTIONS_TAB, 'b.ts'],
      activePath: 'b.ts',
    });
  });

  it('activates the right neighbour when the active tab closes', () => {
    const state = {
      openPaths: [INSTRUCTIONS_TAB, 'a.ts', 'b.ts'],
      activePath: 'a.ts',
    };

    expect(closeTab(state, 'a.ts')).toEqual({
      openPaths: [INSTRUCTIONS_TAB, 'b.ts'],
      activePath: 'b.ts',
    });
  });

  it('activates the left neighbour when the active tab has no right neighbour', () => {
    const state = {
      openPaths: [INSTRUCTIONS_TAB, 'a.ts'],
      activePath: 'a.ts',
    };

    expect(closeTab(state, 'a.ts')).toEqual({
      openPaths: [INSTRUCTIONS_TAB],
      activePath: INSTRUCTIONS_TAB,
    });
  });

  it('sets the active tab to null when the last tab closes', () => {
    expect(closeTab({ openPaths: ['a.ts'], activePath: 'a.ts' }, 'a.ts')).toEqual({
      openPaths: [],
      activePath: null,
    });
  });

  it('closes all tabs', () => {
    expect(closeAllTabs()).toEqual({ openPaths: [], activePath: null });
  });
});
