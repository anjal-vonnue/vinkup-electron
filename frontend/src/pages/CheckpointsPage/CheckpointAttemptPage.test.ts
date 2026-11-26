import { describe, expect, it } from 'vitest';
import { lockedMessage } from './checkpointUi';

describe('lockedMessage', () => {
  it('describes a manual submission without claiming time is up', () => {
    expect(lockedMessage(false, false)).toBe(
      'Your attempt is being submitted and can no longer be edited.'
    );
  });

  it('blames the clock only when the attempt actually expired', () => {
    expect(lockedMessage(true, false)).toBe(
      'Time is up. Your attempt is being submitted and can no longer be edited.'
    );
  });

  it('reports a failed expired submission', () => {
    expect(lockedMessage(true, true)).toBe(
      'Time is up. The attempt is locked; submission did not complete.'
    );
  });

  it('reports a failed manual submission without claiming time is up', () => {
    expect(lockedMessage(false, true)).toBe('The attempt is locked; submission did not complete.');
  });
});
