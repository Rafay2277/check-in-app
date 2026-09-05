import { pool } from "../db/pool";
import { env } from "../config";
import { calendarDateInShopTz } from "../lib/dates";
import {
  addGhlCheckinNote,
  createGhlCheckinHistoryRecord,
  updateGhlCheckinProfile,
} from "../integrations/ghl";

type AwardPayload = {
  memberId: string;
  ghlContactId: string;
  pointsTotal: number;
  checkinTokenId?: string;
  checkinDate?: string;
  /** Progress flags so retries do not create duplicate GHL Check-ins / notes. */
  ghlProfileUpdated?: boolean;
  ghlCheckinRecordId?: string;
  ghlAssociated?: boolean;
  ghlNoteAdded?: boolean;
};

type OutboxRow = {
  id: string;
  type: "award_ghl_point";
  payload: AwardPayload;
  attempts: number;
};

function backoffSeconds(attempts: number): number {
  // 5s, 15s, 45s, 2m, 5m, 15m, ... capped
  const base = Math.min(5 * Math.pow(3, Math.max(0, attempts - 1)), 900);
  return base;
}

/**
 * Claim one pending task with a short lease (available_at pushed forward).
 * Without this, the poller + post-validate drain can both process the same
 * pending row and create duplicate GHL Check-in records.
 */
async function claimNextTask(): Promise<OutboxRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<OutboxRow>(
      `WITH picked AS (
         SELECT id
         FROM outbox_tasks
         WHERE status = 'pending'
           AND available_at <= NOW()
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE outbox_tasks t
       SET attempts = t.attempts + 1,
           available_at = NOW() + INTERVAL '15 minutes'
       FROM picked
       WHERE t.id = picked.id
       RETURNING t.id, t.type, t.payload, t.attempts`
    );

    await client.query("COMMIT");
    return rows[0] ?? null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function patchOutboxPayload(
  id: string,
  payload: AwardPayload
): Promise<void> {
  await pool.query(
    `UPDATE outbox_tasks
     SET payload = $2::jsonb
     WHERE id = $1`,
    [id, JSON.stringify(payload)]
  );
}

async function processAwardGhlPoint(task: OutboxRow): Promise<void> {
  const payload: AwardPayload = { ...task.payload };
  const { ghlContactId, pointsTotal } = payload;
  const checkinDate = payload.checkinDate || calendarDateInShopTz();

  if (!payload.ghlProfileUpdated) {
    await updateGhlCheckinProfile(ghlContactId, pointsTotal, checkinDate);
    payload.ghlProfileUpdated = true;
    await patchOutboxPayload(task.id, payload);
  }

  if (!payload.ghlCheckinRecordId || !payload.ghlAssociated) {
    const recordId = await createGhlCheckinHistoryRecord(
      ghlContactId,
      pointsTotal,
      checkinDate,
      payload.ghlCheckinRecordId
    );
    if (recordId) {
      payload.ghlCheckinRecordId = recordId;
      payload.ghlAssociated = true;
      await patchOutboxPayload(task.id, payload);
    }
  }

  if (!payload.ghlNoteAdded) {
    await addGhlCheckinNote(ghlContactId, pointsTotal, checkinDate);
    payload.ghlNoteAdded = true;
    await patchOutboxPayload(task.id, payload);
  }
}

async function markDone(id: string): Promise<void> {
  await pool.query(
    `UPDATE outbox_tasks
     SET status = 'done', completed_at = NOW(), last_error = NULL
     WHERE id = $1`,
    [id]
  );
}

async function markRetryOrFail(id: string, attempts: number, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);

  if (attempts >= env.OUTBOX_MAX_ATTEMPTS) {
    await pool.query(
      `UPDATE outbox_tasks
       SET status = 'failed', last_error = $2, completed_at = NOW()
       WHERE id = $1`,
      [id, message]
    );
    console.error(`[outbox] task ${id} failed permanently:`, message);
    return;
  }

  const delay = backoffSeconds(attempts);
  await pool.query(
    `UPDATE outbox_tasks
     SET last_error = $2,
         available_at = NOW() + ($3 || ' seconds')::interval
     WHERE id = $1`,
    [id, message, String(delay)]
  );
  console.warn(
    `[outbox] task ${id} attempt ${attempts} failed; retry in ${delay}s:`,
    message
  );
}

/** Drain up to 5 pending outbox tasks (used by poller and post-validate). */
export async function drainOutboxOnce(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const task = await claimNextTask();
    if (!task) break;

    try {
      if (task.type === "award_ghl_point") {
        await processAwardGhlPoint(task);
      } else {
        throw new Error(`Unknown outbox type: ${task.type}`);
      }
      await markDone(task.id);
    } catch (err) {
      await markRetryOrFail(task.id, task.attempts, err);
    }
  }
}

let timer: NodeJS.Timeout | null = null;
let running = false;
/** Pause polling after auth/connectivity failures so we don't trip Supabase circuit breaker. */
let pauseUntil = 0;
let lastPauseLog = 0;

function isDbAuthOrCircuitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /password authentication failed/i.test(msg) ||
    /ECIRCUITBREAKER/i.test(msg) ||
    /too many authentication failures/i.test(msg)
  );
}

export function startOutboxWorker(): void {
  if (timer) return;

  console.log(
    `[outbox] worker started (poll every ${env.OUTBOX_POLL_INTERVAL_MS}ms)`
  );

  timer = setInterval(() => {
    if (running) return;
    if (Date.now() < pauseUntil) return;
    running = true;
    drainOutboxOnce()
      .catch((err) => {
        console.error("[outbox] tick error", err);
        if (isDbAuthOrCircuitError(err)) {
          // Back off 5 minutes — fix DATABASE_URL in Hostinger, then restart
          pauseUntil = Date.now() + 5 * 60_000;
          if (Date.now() - lastPauseLog > 60_000) {
            lastPauseLog = Date.now();
            console.error(
              "[outbox] DB auth/circuit failure — pausing outbox for 5 minutes. Check DATABASE_URL (pooler user must be postgres.<projectRef> and password URL-encoded)."
            );
          }
        }
      })
      .finally(() => {
        running = false;
      });
  }, env.OUTBOX_POLL_INTERVAL_MS);
}

export function stopOutboxWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
