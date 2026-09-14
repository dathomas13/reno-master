import { describe, it, expect } from 'vitest';
import {
  toIsoDate, addDays, formatDate, formatDateWithWeekday, formatMonth,
  monthKey, formatRelativeDay, dueBucket, parseClock, toIsoDateTime,
} from '@/lib/date';

describe('toIsoDate', () => {
  it('uses local time, not UTC', () => {
    // 00:30 local on the 14th must stay the 14th even when UTC is still the 13th
    expect(toIsoDate(new Date(2026, 8, 14, 0, 30))).toBe('2026-09-14');
    expect(toIsoDate(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
  });

  it('formats a local date time', () => {
    expect(toIsoDateTime(new Date(2026, 8, 14, 7, 5, 3))).toBe('2026-09-14T07:05:03');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-09-14', 1)).toBe('2026-09-15');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
});

describe('formatting', () => {
  it('formats German dates', () => {
    expect(formatDate('2026-09-14')).toBe('14.09.2026');
    expect(formatDateWithWeekday('2026-09-14')).toBe('Mo, 14.09.2026');
    expect(formatMonth('2026-09-14')).toBe('September 2026');
    expect(monthKey('2026-09-14')).toBe('2026-09');
  });

  it('names today, yesterday and tomorrow', () => {
    expect(formatRelativeDay('2026-09-14', '2026-09-14')).toBe('heute');
    expect(formatRelativeDay('2026-09-13', '2026-09-14')).toBe('gestern');
    expect(formatRelativeDay('2026-09-15', '2026-09-14')).toBe('morgen');
    expect(formatRelativeDay('2026-09-01', '2026-09-14')).toBe('Di, 01.09.2026');
  });
});

describe('dueBucket', () => {
  it('groups by due date', () => {
    expect(dueBucket(undefined, '2026-09-14')).toBe('none');
    expect(dueBucket('2026-09-13', '2026-09-14')).toBe('overdue');
    expect(dueBucket('2026-09-14', '2026-09-14')).toBe('today');
    expect(dueBucket('2026-09-20', '2026-09-14')).toBe('week');
    expect(dueBucket('2026-09-30', '2026-09-14')).toBe('later');
  });
});

describe('parseClock', () => {
  it('accepts valid times only', () => {
    expect(parseClock('20:00')).toBe(1200);
    expect(parseClock('7:05')).toBe(425);
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('20:60')).toBeNull();
    expect(parseClock('abends')).toBeNull();
  });
});
