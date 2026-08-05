/** Drain up to 5 pending outbox tasks (used by poller and post-validate). */
export declare function drainOutboxOnce(): Promise<void>;
export declare function startOutboxWorker(): void;
export declare function stopOutboxWorker(): void;
