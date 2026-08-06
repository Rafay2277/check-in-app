"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnvFiles = loadEnvFiles;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
/**
 * Hostinger Git deploys wipe hbuilds/versions/... on each release, and their
 * Environment Variables UI often does not persist DATABASE_URL / DB_*.
 * Load .env from stable paths outside the version folder first.
 */
function loadEnvFiles() {
    const loaded = [];
    const tried = new Set();
    const candidates = [
        process.env.ENV_FILE,
        // Stable Hostinger path (survives redeploy): domain/private/checkin.env
        path_1.default.resolve(process.cwd(), "../../../../private/checkin.env"),
        path_1.default.resolve(process.cwd(), "../../../private/checkin.env"),
        path_1.default.resolve(process.cwd(), "../../private/checkin.env"),
        path_1.default.resolve(__dirname, "../../../../../../private/checkin.env"),
        path_1.default.resolve(__dirname, "../../../../../private/checkin.env"),
        // Domain-root .env (also outside versioned build)
        path_1.default.resolve(process.cwd(), "../../../../.env"),
        path_1.default.resolve(process.cwd(), "../../../.env"),
        // Local monorepo / default
        path_1.default.resolve(process.cwd(), "../../.env"),
        path_1.default.resolve(process.cwd(), ".env"),
        path_1.default.resolve(__dirname, "../../../.env"),
    ].filter((p) => Boolean(p));
    for (const file of candidates) {
        const abs = path_1.default.resolve(file);
        if (tried.has(abs))
            continue;
        tried.add(abs);
        if (!fs_1.default.existsSync(abs))
            continue;
        const result = dotenv_1.default.config({ path: abs, override: false });
        if (!result.error) {
            loaded.push(abs);
        }
    }
    // cwd default as last resort
    dotenv_1.default.config({ override: false });
    if (loaded.length > 0) {
        console.log(`[env] loaded file(s): ${loaded.join(" | ")}`);
    }
    else {
        console.warn("[env] no checkin.env/.env file found — relying on process environment only");
    }
    return loaded;
}
//# sourceMappingURL=loadEnv.js.map