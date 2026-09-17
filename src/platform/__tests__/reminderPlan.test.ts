import { describe, expect, it } from 'vitest';
import {
  describeReminder,
  dueReminder,
  isReminderId,
  planReminders,
  reminderId,
  TEST_REMINDER_ID,
} from '@/platform/reminderPlan';

/** a local moment, so the test says the same thing in every time zone */
function at(iso: string, clock = '00:00'): Date {
  const [y, m, d] = iso.split('-').map(Number);
  const [h, min] = clock.split(':').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0, 0, 0);
}

const time = '20:00';

describe('planReminders', () => {
  it('starts with today when the evening is still ahead', () => {
    const plan = planReminders({ enabled: true, time, datesWithEntry: [], now: at('2026-09-17', '08:30'), days: 3 });
    expect(plan.map((reminder) => reminder.date)).toEqual(['2026-09-17', '2026-09-18', '2026-09-19']);
    expect(plan[0]?.at.getHours()).toBe(20);
    expect(plan[0]?.at.getMinutes()).toBe(0);
  });

  it('skips the moment that has already passed today', () => {
    const plan = planReminders({ enabled: true, time, datesWithEntry: [], now: at('2026-09-17', '21:15'), days: 3 });
    expect(plan.map((reminder) => reminder.date)).toEqual(['2026-09-18', '2026-09-19']);
  });

  it('leaves out the days that already have an entry', () => {
    const plan = planReminders({
      enabled: true,
      time,
      datesWithEntry: ['2026-09-17', '2026-09-19'],
      now: at('2026-09-17', '08:00'),
      days: 4,
    });
    expect(plan.map((reminder) => reminder.date)).toEqual(['2026-09-18', '2026-09-20']);
  });

  it('accepts a full timestamp as the day of an entry', () => {
    const plan = planReminders({
      enabled: true,
      time,
      datesWithEntry: ['2026-09-17T14:03:00'],
      now: at('2026-09-17', '08:00'),
      days: 2,
    });
    expect(plan.map((reminder) => reminder.date)).toEqual(['2026-09-18']);
  });

  it('plans nothing when the reminder is off or the time is nonsense', () => {
    expect(planReminders({ enabled: false, time, datesWithEntry: [], now: at('2026-09-17') })).toEqual([]);
    expect(planReminders({ enabled: true, time: '25:70', datesWithEntry: [], now: at('2026-09-17') })).toEqual([]);
    expect(planReminders({ enabled: true, time: '', datesWithEntry: [], now: at('2026-09-17') })).toEqual([]);
  });

  it('reaches a fortnight ahead by default, so a fortnight without the app still reminds', () => {
    const plan = planReminders({ enabled: true, time, datesWithEntry: [], now: at('2026-09-17', '08:00') });
    expect(plan).toHaveLength(14);
    expect(plan[13]?.date).toBe('2026-09-30');
  });

  it('crosses the end of the month and the end of the year', () => {
    const plan = planReminders({ enabled: true, time, datesWithEntry: [], now: at('2026-12-30', '08:00'), days: 4 });
    expect(plan.map((reminder) => reminder.date)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
});

describe('reminderId', () => {
  it('gives every day its own id, so a single day can be withdrawn again', () => {
    expect(reminderId('2026-09-17')).toBe(reminderId('2026-09-17'));
    expect(reminderId('2026-09-17')).toBe(reminderId('2026-09-18') - 1);
  });

  it('stays inside the 32 bit range Android insists on', () => {
    expect(reminderId('2099-12-31')).toBeLessThan(2_147_483_647);
    expect(reminderId('2026-09-17')).toBeGreaterThan(0);
  });

  it('knows its own ids and leaves everything else alone', () => {
    expect(isReminderId(reminderId('2026-09-17'))).toBe(true);
    expect(isReminderId(TEST_REMINDER_ID)).toBe(true);
    expect(isReminderId(1)).toBe(false);
    expect(isReminderId(12_345)).toBe(false);
  });
});

describe('dueReminder', () => {
  it('is due once the evening has passed with nothing written', () => {
    const due = dueReminder({ enabled: true, time, datesWithEntry: [], now: at('2026-09-17', '20:00') });
    expect(due?.date).toBe('2026-09-17');
  });

  it('stays quiet before the time', () => {
    expect(dueReminder({ enabled: true, time, datesWithEntry: [], now: at('2026-09-17', '19:59') })).toBeNull();
  });

  it('stays quiet when today is written, or when it was already shown today', () => {
    expect(
      dueReminder({ enabled: true, time, datesWithEntry: ['2026-09-17'], now: at('2026-09-17', '22:00') }),
    ).toBeNull();
    expect(
      dueReminder({
        enabled: true,
        time,
        datesWithEntry: [],
        now: at('2026-09-17', '22:00'),
        lastShown: '2026-09-17',
      }),
    ).toBeNull();
  });

  it('is due again the next evening, even after yesterday was shown', () => {
    const due = dueReminder({
      enabled: true,
      time,
      datesWithEntry: ['2026-09-17'],
      now: at('2026-09-18', '20:30'),
      lastShown: '2026-09-17',
    });
    expect(due?.date).toBe('2026-09-18');
  });
});

describe('describeReminder', () => {
  it('reads like the settings line', () => {
    const now = at('2026-09-17', '08:00');
    const [todayEntry] = planReminders({ enabled: true, time, datesWithEntry: [], now, days: 2 });
    expect(describeReminder(todayEntry!, now)).toBe('heute um 20:00');

    const [tomorrow] = planReminders({
      enabled: true,
      time,
      datesWithEntry: ['2026-09-17'],
      now,
      days: 2,
    });
    expect(describeReminder(tomorrow!, now)).toBe('morgen um 20:00');
  });

  it('names the weekday when it is further out', () => {
    const now = at('2026-09-17', '08:00');
    const plan = planReminders({ enabled: true, time: '21:30', datesWithEntry: [], now, days: 4 });
    expect(describeReminder(plan[2]!, now)).toBe('Sa, 19.09.2026 um 21:30');
  });
});
