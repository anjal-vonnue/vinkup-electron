import { describe, expect, it } from 'vitest';
import {
  accountStatusSchema,
  assignMentorSchema,
  createStaffSchema,
  createTraineeSchema,
  staffIdParamsSchema,
  traineeIdParamsSchema,
  updateStaffSchema,
  updateTraineeSchema,
} from './manager.schema';

const ID = '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11';

describe('manager param schemas', () => {
  it('accepts UUID params and rejects malformed ids', () => {
    expect(staffIdParamsSchema.safeParse({ staffId: ID }).success).toBe(true);
    expect(traineeIdParamsSchema.safeParse({ traineeId: ID }).success).toBe(true);
    expect(traineeIdParamsSchema.safeParse({ traineeId: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('createStaffSchema', () => {
  it('trims the name edges and lower-cases the email', () => {
    const result = createStaffSchema.parse({
      name: '  Test   Mentor ',
      email: 'Test.Mentor@VONNUE.com',
      role: 'mentor',
    });

    expect(result).toEqual({
      name: 'Test   Mentor',
      email: 'test.mentor@vonnue.com',
      role: 'mentor',
    });
  });

  it('accepts the manager role and rejects trainee or unknown roles', () => {
    const base = { name: 'Test Person', email: 'person@vonnue.com' };

    expect(createStaffSchema.safeParse({ ...base, role: 'manager' }).success).toBe(true);
    expect(createStaffSchema.safeParse({ ...base, role: 'trainee' }).success).toBe(false);
    expect(createStaffSchema.safeParse({ ...base, role: 'admin' }).success).toBe(false);
  });

  it('rejects short names and invalid emails', () => {
    expect(
      createStaffSchema.safeParse({ name: 'A', email: 'a@vonnue.com', role: 'mentor' }).success
    ).toBe(false);
    expect(
      createStaffSchema.safeParse({ name: 'Test Person', email: 'nope', role: 'mentor' }).success
    ).toBe(false);
  });
});

describe('updateStaffSchema and updateTraineeSchema', () => {
  it('requires at least one field', () => {
    expect(updateStaffSchema.safeParse({}).success).toBe(false);
    expect(updateTraineeSchema.safeParse({}).success).toBe(false);
  });

  it('accepts partial updates and normalizes the email', () => {
    expect(updateStaffSchema.parse({ email: 'NEW@VONNUE.com' })).toEqual({
      email: 'new@vonnue.com',
    });
    expect(updateStaffSchema.parse({ role: 'manager' })).toEqual({ role: 'manager' });
    expect(updateTraineeSchema.parse({ name: ' Renamed  Trainee ' })).toEqual({
      name: 'Renamed  Trainee',
    });
  });
});

describe('createTraineeSchema', () => {
  it('accepts an omitted, null, or UUID mentor', () => {
    const base = { name: 'New Trainee', email: 'new@vonnue.com' };

    expect(createTraineeSchema.safeParse(base).success).toBe(true);
    expect(createTraineeSchema.safeParse({ ...base, mentorId: null }).success).toBe(true);
    expect(createTraineeSchema.safeParse({ ...base, mentorId: ID }).success).toBe(true);
    expect(createTraineeSchema.safeParse({ ...base, mentorId: 'nope' }).success).toBe(false);
  });
});

describe('accountStatusSchema and assignMentorSchema', () => {
  it('only accepts booleans for the active flag', () => {
    expect(accountStatusSchema.parse({ isActive: true })).toEqual({ isActive: true });
    expect(accountStatusSchema.safeParse({ isActive: 'true' }).success).toBe(false);
    expect(accountStatusSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a mentor UUID or null for unassignment', () => {
    expect(assignMentorSchema.parse({ mentorId: ID })).toEqual({ mentorId: ID });
    expect(assignMentorSchema.parse({ mentorId: null })).toEqual({ mentorId: null });
    expect(assignMentorSchema.safeParse({}).success).toBe(false);
    expect(assignMentorSchema.safeParse({ mentorId: 'nope' }).success).toBe(false);
  });
});
