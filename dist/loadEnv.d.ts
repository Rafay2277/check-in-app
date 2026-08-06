/**
 * Hostinger Git deploys wipe hbuilds/versions/... on each release, and their
 * Environment Variables UI often does not persist DATABASE_URL / DB_*.
 * Load .env from stable paths outside the version folder first.
 */
export declare function loadEnvFiles(): string[];
