"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
exports.withTransaction = withTransaction;
const pg_1 = require("pg");
const config_1 = require("../config");
const needsSsl = /supabase\.co/i.test(config_1.env.DATABASE_URL) ||
    /[?&]sslmode=require/i.test(config_1.env.DATABASE_URL);
exports.pool = new pg_1.Pool({
    connectionString: config_1.env.DATABASE_URL,
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