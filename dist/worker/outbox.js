"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drainOutboxOnce = drainOutboxOnce;
exports.startOutboxWorker = startOutboxWorker;
exports.stopOutboxWorker = stopOutboxWorker;
const pool_1 = require("../db/pool");
const config_1 = require("../config");
const dates_1 = require("../lib/dates");
const ghl_1 = require("../integrations/ghl");
function backoffSeconds(attempts) {
    // 5s, 15s, 45s, 2m, 5m, 15m, ... capped
    const base = Math.min(5 * Math.pow(3, Math.max(0, attempts - 1)), 900);
    return base;
}
async function claimNextTask() {
    const client = await pool_1.pool.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(`SELECT id, type, payload, attempts
       FROM outbox_tasks
       WHERE status = 'pending'
         AND available_at <= NOW()
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`);
        if (!rows[0]) {
            await client.query("COMMIT");
            return null;
        }
        await client.query(`UPDATE outbox_tasks
       SET attempts = attempts + 1
       WHERE id = $1`, [rows[0].id]);
        await client.query("COMMIT");
        return {
            ...rows[0],
            attempts: rows[0].attempts + 1,
        };
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
async function processAwardGhlPoint(task) {
    const { ghlContactId, pointsTotal } = task.payload;
    const checkinDate = task.payload.checkinDate || (0, dates_1.calendarDateInShopTz)();
    await (0, ghl_1.updateGhlCheckinProfile)(ghlContactId, pointsTotal, checkinDate);
    await (0, ghl_1.addGhlCheckinNote)(ghlContactId, pointsTotal, checkinDate);
}
async function markDone(id) {
    await pool_1.pool.query(`UPDATE outbox_tasks
     SET status = 'done', completed_at = NOW(), last_error = NULL
     WHERE id = $1`, [id]);
}
async function markRetryOrFail(id, attempts, err) {
    const message = err instanceof Error ? err.message : String(err);
    if (attempts >= config_1.env.OUTBOX_MAX_ATTEMPTS) {
        await pool_1.pool.query(`UPDATE outbox_tasks
       SET status = 'failed', last_error = $2, completed_at = NOW()
       WHERE id = $1`, [id, message]);
        console.error(`[outbox] task ${id} failed permanently:`, message);
        return;
    }
    const delay = backoffSeconds(attempts);
    await pool_1.pool.query(`UPDATE outbox_tasks
     SET last_error = $2,
         available_at = NOW() + ($3 || ' seconds')::interval
     WHERE id = $1`, [id, message, String(delay)]);
    console.warn(`[outbox] task ${id} attempt ${attempts} failed; retry in ${delay}s:`, message);
}
/** Drain up to 5 pending outbox tasks (used by poller and post-validate). */
async function drainOutboxOnce() {
    for (let i = 0; i < 5; i++) {
        const task = await claimNextTask();
        if (!task)
            break;
        try {
            if (task.type === "award_ghl_point") {
                await processAwardGhlPoint(task);
            }
            else {
                throw new Error(`Unknown outbox type: ${task.type}`);
            }
            await markDone(task.id);
        }
        catch (err) {
            await markRetryOrFail(task.id, task.attempts, err);
        }
    }
}
let timer = null;
let running = false;
/** Pause polling after auth/connectivity failures so we don't trip Supabase circuit breaker. */
let pauseUntil = 0;
let lastPauseLog = 0;
function isDbAuthOrCircuitError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (/password authentication failed/i.test(msg) ||
        /ECIRCUITBREAKER/i.test(msg) ||
        /too many authentication failures/i.test(msg));
}
function startOutboxWorker() {
    if (timer)
        return;
    console.log(`[outbox] worker started (poll every ${config_1.env.OUTBOX_POLL_INTERVAL_MS}ms)`);
    timer = setInterval(() => {
        if (running)
            return;
        if (Date.now() < pauseUntil)
            return;
        running = true;
        drainOutboxOnce()
            .catch((err) => {
            console.error("[outbox] tick error", err);
            if (isDbAuthOrCircuitError(err)) {
                // Back off 5 minutes — fix DATABASE_URL in Hostinger, then restart
                pauseUntil = Date.now() + 5 * 60_000;
                if (Date.now() - lastPauseLog > 60_000) {
                    lastPauseLog = Date.now();
                    console.error("[outbox] DB auth/circuit failure — pausing outbox for 5 minutes. Check DATABASE_URL (pooler user must be postgres.<projectRef> and password URL-encoded).");
                }
            }
        })
            .finally(() => {
            running = false;
        });
    }, config_1.env.OUTBOX_POLL_INTERVAL_MS);
}
function stopOutboxWorker() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
//# sourceMappingURL=outbox.js.map