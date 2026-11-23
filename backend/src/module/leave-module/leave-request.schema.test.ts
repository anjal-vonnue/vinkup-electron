import { describe, expect, it } from 'vitest';
import { createLeaveRequestSchema, reviewLeaveRequestSchema } from './leave-request.schema';

describe('createLeaveRequestSchema', () => {
  it('trims and accepts a subject and reason', () => {
    expect(
      createLeaveRequestSchema.parse({ subject: '  Conference  ', reason: '  Offsite  ' })
    ).toEqual({ subject: 'Conference', reason: 'Offsite' });
  });

  it.each([
    [{ subject: '', reason: 'A reason' }, 'subject'],
    [{ subject: 'Subject', reason: '   ' }, 'reason'],
    [{ subject: 'x'.repeat(201), reason: 'A reason' }, 'subject'],
    [{ subject: 'Subject', reason: 'x'.repeat(2001) }, 'reason'],
  ])('rejects invalid input %o', (input, field) => {
    const result = createLeaveRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === field)).toBe(true);
    }
  });
});

describe('reviewLeaveRequestSchema', () => {
  it('allows an approval without feedback', () => {
    expect(reviewLeaveRequestSchema.parse({ decision: 'APPROVED' })).toEqual({
      decision: 'APPROVED',
    });
  });

  it('requires feedback for a rejection', () => {
    expect(reviewLeaveRequestSchema.safeParse({ decision: 'REJECTED' }).success).toBe(false);
    expect(
      reviewLeaveRequestSchema.safeParse({ decision: 'REJECTED', feedback: '  Try later.  ' })
    ).toEqual({ success: true, data: { decision: 'REJECTED', feedback: 'Try later.' } });
  });

  it('rejects unknown decisions', () => {
    expect(reviewLeaveRequestSchema.safeParse({ decision: 'PENDING' }).success).toBe(false);
  });
});
