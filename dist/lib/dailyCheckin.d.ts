import { PoolClient } from "pg";
/** True if this member already completed a check-in for today's shop calendar date. */
export declare function memberCheckedInToday(memberId: string, client?: PoolClient): Promise<boolean>;
/**
 * Record today's check-in. Returns false if the member already had one today
 * (unique conflict / prior row).
 */
export declare function tryRecordDailyCheckin(client: PoolClient, memberId: string, opts?: {
    permanentTokenId?: string;
    checkinTokenId?: string;
}): Promise<{
    recorded: boolean;
    checkinDate: string;
}>;
