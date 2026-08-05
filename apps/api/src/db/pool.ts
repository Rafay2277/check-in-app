import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { env } from "../config";

const needsSsl =
  /supabase\.co/i.test(env.DATABASE_URL) ||
  /[?&]sslmode=/i.test(env.DATABASE_URL);

/**
 * Newer `pg` treats sslmode=require like verify-full, which breaks on
 * Hostinger→Supabase (self-signed chain). Strip sslmode from the URI and
 * rely on explicit ssl: { rejectUnauthorized: false } instead.
 */
function connectionStringForPool(raw: string): string {
  try {
    const url = new URL(raw);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    // URL with empty search should not end with '?'
    let out = url.toString();
    if (out.endsWith("?")) out = out.slice(0, -1);
    return out;
  } catch {
    return raw
      .replace(/([?&])sslmode=[^&]*/g, "$1")
      .replace(/[?&]$/, "")
      .replace(/\?&/, "?");
  }
}

export const pool = new Pool({
  connectionString: connectionStringForPool(env.DATABASE_URL),
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
