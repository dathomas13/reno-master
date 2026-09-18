/**
 * Evening reminder.
 *
 * Runs every ten minutes in Berlin time. For each user who switched the reminder on it
 * checks whether the configured time has just passed and whether a diary entry for today
 * already exists. Only then a push goes out - a reminder for something already done is
 * the fastest way to get notifications turned off for good.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

initializeApp();

const db = getFirestore();
const REGION = 'europe-west3';
const APP_URL = 'https://dathomas13.github.io/reno-master/';
const WINDOW_MINUTES = 10;

function berlinNow(): { date: string; minutes: number } {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [date, time] = formatter.format(new Date()).split(' ');
  const [hours, minutes] = (time ?? '00:00').split(':').map(Number);
  return { date: date ?? '', minutes: (hours ?? 0) * 60 + (minutes ?? 0) };
}

function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export const diaryReminder = onSchedule(
  { schedule: 'every 10 minutes', timeZone: 'Europe/Berlin', region: REGION },
  async () => {
    const { date, minutes } = berlinNow();

    const entries = await db.collection('diary').where('date', '==', date).limit(1).get();
    if (!entries.empty) return; // there is already an entry for today

    const users = await db.collection('users').where('reminderEnabled', '==', true).get();
    for (const user of users.docs) {
      const data = user.data() as { reminderTime?: string; fcmTokens?: string[] };
      const due = parseClock(data.reminderTime ?? '20:00');
      const tokens = data.fcmTokens ?? [];
      if (due === null || tokens.length === 0) continue;
      // fire once, in the ten minute window that starts at the configured time
      if (minutes < due || minutes >= due + WINDOW_MINUTES) continue;

      const response = await getMessaging().sendEachForMulticast({
        tokens,
        data: {
          title: 'Bautagebuch',
          body: 'Heute noch kein Eintrag - kurz festhalten, was passiert ist?',
          route: '/tagebuch/neu',
          date,
        },
        webpush: {
          fcmOptions: { link: `${APP_URL}#/tagebuch/neu` },
        },
      });

      // drop tokens of browsers that were uninstalled or cleared
      const dead = response.responses
        .map((result, index) => (result.success ? null : tokens[index]))
        .filter((token): token is string => Boolean(token));
      if (dead.length) {
        await user.ref.update({ fcmTokens: FieldValue.arrayRemove(...dead) });
      }
    }
  },
);
