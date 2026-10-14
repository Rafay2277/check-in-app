import { PoolClient } from "pg";
/**
 * Hostinger often sets SKIP_MIGRATE_ON_START=true, so 005 may never run.
 * Create membership_tier enum + column idempotently at runtime.
 */
export declare function ensureMembershipTierSchema(client?: PoolClient): Promise<void>;
