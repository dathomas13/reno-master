/**
 * Keeps the reminder on the device in step with the diary.
 *
 * Everything the decision needs is already in the app: the configured time sits in the
 * user profile, and which days have an entry comes from the same live query the rest of
 * the app uses - answered by the offline cache, so this works with no connection. Whenever
 * one of the two changes, the plan is handed to the operating system again. Writing
 * today's entry therefore takes today's reminder with it, within the same second.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useCollection } from './hooks';
import { COL, type DiaryEntry } from './types';
import { limit, orderBy } from '@/firebase/db';
import { today } from '@/lib/date';
import {
  dueReminder,
  planReminders,
  type PlannedReminder,
} from '@/platform/reminderPlan';
import {
  applyReminderPlan,
  lastShownDate,
  reminderMode,
  showReminderNow,
  watchReminderTaps,
  type ReminderMode,
} from '@/platform/reminder';
import { rememberDiaryReminderDates } from '@/platform/diaryReminderMarker';

/** how often the browser looks at the clock while the app is open */
const TICK_MS = 60_000;

interface ReminderState {
  enabled: boolean;
  time: string;
  /** the days from today on that already have an entry */
  dates: string[];
  /** false while profile or diary have not arrived yet - then nothing is touched */
  known: boolean;
}

function useReminderState(): ReminderState {
  const { profile } = useAuth();
  // today and the days after it are the only ones a reminder can still be planned for,
  // and a query that does not react to older entries keeps the rescheduling rare
  const { data: entries, loading } = useCollection<DiaryEntry>(COL.diary, [orderBy('date', 'desc'), limit(40)]);

  const dates = useMemo(
    () => entries.map((entry) => entry.date).filter((date) => date >= today()).sort(),
    [entries],
  );

  return {
    enabled: profile?.reminderEnabled ?? false,
    time: profile?.reminderTime ?? '20:00',
    dates,
    known: profile !== null && !loading,
  };
}

/**
 * The driver. Mounted once, next to the app shell.
 *
 * On the phone it hands the next fortnight to Android, which wakes itself at the right
 * minute. In the browser, where that is impossible, it watches the clock while the app is
 * open and shows the reminder itself.
 */
export function useDiaryReminder(): void {
  const { enabled, time, dates, known } = useReminderState();
  const signature = dates.join(',');

  const apply = useCallback(() => {
    if (!known) return; // an offline start without a cached profile leaves the alarms alone
    void applyReminderPlan({ enabled, time, datesWithEntry: signature ? signature.split(',') : [] });
  }, [known, enabled, time, signature]);

  useEffect(() => {
    apply();
    // coming back after a day in the pocket: the plan has moved on by a day
    const onVisible = () => {
      if (document.visibilityState === 'visible') apply();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [apply]);

  useEffect(() => {
    if (!known) return;
    void rememberDiaryReminderDates(signature ? signature.split(',') : []);
  }, [known, signature]);

  useEffect(() => {
    if (!known || !enabled || reminderMode() !== 'web') return;
    const tick = () => {
      const due = dueReminder({
        enabled,
        time,
        datesWithEntry: signature ? signature.split(',') : [],
        lastShown: lastShownDate(),
      });
      if (due) void showReminderNow(due.date);
    };
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [known, enabled, time, signature]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let gone = false;
    void watchReminderTaps().then((remove) => {
      // the listener may arrive after the unmount; then it is removed right away
      if (gone) remove();
      else stop = remove;
    });
    return () => {
      gone = true;
      stop?.();
    };
  }, []);
}

export interface ReminderStatus {
  mode: ReminderMode;
  enabled: boolean;
  /** the next moment a reminder would appear, or null when there is none */
  next: PlannedReminder | null;
  /** true when today already has an entry, so today needs no reminder */
  writtenToday: boolean;
}

/** what the settings screen shows; reads only, schedules nothing */
export function useReminderStatus(): ReminderStatus {
  const { enabled, time, dates } = useReminderState();
  const plan = planReminders({ enabled, time, datesWithEntry: dates });
  return {
    mode: reminderMode(),
    enabled,
    next: plan[0] ?? null,
    writtenToday: dates.includes(today()),
  };
}
