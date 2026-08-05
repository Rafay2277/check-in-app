import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
export declare const pool: Pool;
export declare function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
export declare function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
