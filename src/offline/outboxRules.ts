/**
 * The decisions the upload queue makes, without IndexedDB and without the network.
 *
 * They live apart from `outbox.ts` for the same reason `modelRelease.ts` lives apart from
 * `modelSync.ts`: this is the part that can be wrong in a way nobody notices for a day,
 * so it is the part that gets tested. A file that was uploaded long ago but still counts
 * as "wird geladen" is exactly such a mistake.
 */

/** after this many attempts a file is no longer retried on its own */
export const MAX_ATTEMPTS = 10;

export interface QueuedJob {
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
}

/** given up on: still in the queue, but nothing will happen to it without a nudge */
export function isFailed(job: { attempts: number }): boolean {
  return job.attempts >= MAX_ATTEMPTS;
}

/**
 * What the badge shows. `pending` and `failed` never count the same file twice - the
 * badge used to add a file that had given up to the ones still on their way.
 */
export function queueState(jobs: { attempts: number }[]): { pending: number; failed: number } {
  const failed = jobs.filter(isFailed).length;
  return { pending: jobs.length - failed, failed };
}

/** oldest first, and only what is due now; `force` is the manual "try again" */
export function dueJobs<T extends QueuedJob>(jobs: T[], now: number, force = false): T[] {
  return [...jobs]
    .sort((a, b) => a.createdAt - b.createdAt)
    .filter((job) => force || (job.nextAttemptAt <= now && !isFailed(job)));
}

/** doubling, but never more than ten minutes - the app may be in the foreground for less */
export function backoffFor(attempts: number): number {
  return Math.min(2 ** attempts * 1000, 10 * 60 * 1000);
}

/**
 * The document this file belongs to is gone. Its photo was deleted while the file was
 * still queued, so the job can never succeed: retrying it would upload the deleted file
 * again and fail on the same missing document for ever.
 */
export function documentGone(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return code === 'not-found' || /no document to update/i.test(message);
}
