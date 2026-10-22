import { PoolClient } from "pg";
/**
 * Hostinger often sets SKIP_MIGRATE_ON_START=true, so 006 may never run.
 * Add members.member_number idempotently at runtime.
 */
export declare function ensureMemberNumberSchema(client?: PoolClient): Promise<void>;
