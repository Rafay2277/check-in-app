"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
exports.withTransaction = withTransaction;
const pg_1 = require("pg");
const config_1 = require("../config");
const needsSsl = /supabase\.co/i.test(config_1.env.DATABASE_URL) ||
    /[?&]sslmode=/i.test(config_1.env.DATABASE_URL);
/**
 * Newer `pg` treats sslmode=require like verify-full, which breaks on
 * Hostinger→Supabase (self-signed chain). Strip sslmode from the URI and
 * rely on explicit ssl: { rejectUnauthorized: false } instead.
 *
 * Also: use postgres: scheme for URL parsing (postgresql: is not always reliable).
 */
function connectionStringForPool(raw) {
    const normalized = raw.replace(/^postgresql:/i, "postgres:");
    try {
        const url = new URL(normalized);
        url.searchParams.delete("sslmode");
        url.searchParams.delete("uselibpqcompat");
        // Keep username exactly as provided (pooler needs postgres.<projectRef>)
        let out = url.toString();
        if (out.endsWith("?"))
            out = out.slice(0, -1);
        // Log non-secret connection target once
        console.log(`[db] connecting as user="${decodeURIComponent(url.username)}" host=${url.hostname} port=${url.port || "5432"}`);
        return out;
    }
    catch {
        return raw
            .replace(/([?&])sslmode=[^&]*/g, "$1")
            .replace(/[?&]$/, "")
            .replace(/\?&/, "?");
    }
}
exports.pool = new pg_1.Pool({
    connectionString: connectionStringForPool(config_1.env.DATABASE_URL),
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});
async function query(text, params) {
    return exports.pool.query(text, params);
}
async function withTransaction(fn) {
    const client = await exports.pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=pool.js.map