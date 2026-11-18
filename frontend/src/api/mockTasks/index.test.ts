import { describe, expect, it } from 'vitest';
import { mockDayContents } from '../dayOverview';
import { catalogDays, catalogTaskCode, catalogTaskResponse, scenarios } from './index';

describe('task catalog', () => {
  it('has a catalog day for every day page, and no extra days', () => {
    const catalogIds = catalogDays.map((day) => day.dayId).sort();

    expect(catalogIds).toEqual(Object.keys(mockDayContents).sort());
  });

  it('numbers tasks 1..n with the stretch goal last, and ids match the day page format', () => {
    for (const day of catalogDays) {
      day.tasks.forEach((task, index) => {
        expect(task.sequenceOrder).toBe(index + 1);
        expect(task.id).toBe(`${day.dayId}-t-${index + 1}`);
        expect(task.instructionsMarkdown.length).toBeGreaterThan(40);
      });
      const stretch = day.tasks.filter((task) => task.isStretchGoal);
      expect(stretch.length).toBeLessThanOrEqual(1);
      if (stretch.length === 1) expect(day.tasks[day.tasks.length - 1].isStretchGoal).toBe(true);
    }
  });

  it('gives every task a runtime and at least one starter file', () => {
    for (const day of catalogDays) {
      for (const task of day.tasks) {
        const response = catalogTaskResponse(task.id, 'not_started');
        const code = catalogTaskCode(task.id);

        expect(response?.runtime).toMatch(/^(browser|node|sql)$/);
        expect(code?.files.length).toBeGreaterThan(0);
        if (response?.runtime === 'browser') {
          expect(code?.files.some((file) => file.path.endsWith('.html'))).toBe(true);
        }
        if (response?.runtime === 'sql') {
          expect(code?.files.some((file) => file.path.endsWith('.sql'))).toBe(true);
        }
      }
    }
  });

  it('uses the runtime each course needs', () => {
    expect(catalogTaskResponse('css-day-03-t-1', 'not_started')?.runtime).toBe('browser');
    expect(catalogTaskResponse('js-day-08-t-1', 'not_started')).toMatchObject({
      runtime: 'node',
      runCommand: 'npm test',
    });
    expect(catalogTaskResponse('ts-day-01-t-1', 'not_started')?.runCommand).toBe('npm run check');
    expect(catalogTaskResponse('postgresql-day-01-t-1', 'not_started')).toMatchObject({
      runtime: 'node',
      runCommand: null,
      setupSql: null,
    });
    expect(catalogTaskResponse('postgresql-day-06-t-1', 'not_started')).toMatchObject({
      runtime: 'node',
      runCommand: 'npm test',
    });
    expect(catalogTaskResponse('react-day-07-t-1', 'not_started')?.runCommand).toBe('npm run dev');
  });

  it('keeps scenario ids separate from curriculum ids', () => {
    for (const id of Object.keys(scenarios)) {
      expect(id.startsWith('t-')).toBe(true);
      expect(catalogTaskResponse(id, 'not_started')).toBeNull();
    }
  });
});
