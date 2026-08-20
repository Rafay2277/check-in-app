"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const config_1 = require("./config");
const auth_1 = require("./routes/auth");
const checkin_1 = require("./routes/checkin");
const staff_1 = require("./routes/staff");
const analytics_1 = require("./routes/analytics");
const ghl_1 = require("./routes/ghl");
const outbox_1 = require("./worker/outbox");
const pool_1 = require("./db/pool");
(0, config_1.assertLiveIntegrationsConfigured)();
process.on("uncaughtException", (err) => {
    console.error("[fatal] uncaughtException", err);
});
process.on("unhandledRejection", (err) => {
    console.error("[fatal] unhandledRejection", err);
});
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "32kb" }));
app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        mockIntegrations: config_1.env.MOCK_INTEGRATIONS,
        skipSmsOtp: config_1.env.SKIP_SMS_OTP,
        httpsPort: config_1.env.HTTPS_PORT,
    });
});
/** Live DB probe — use this to verify Hostinger DATABASE_URL without reading secrets.
 * Always HTTP 200 so Hostinger's CDN 503 (app down) is not confused with "DB bad". */
app.get("/health/db", async (_req, res) => {
    try {
        const result = await pool_1.pool.query("SELECT 1 AS ok");
        res.json({ ok: true, db: result.rows[0]?.ok === 1 });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[health/db] failed", message);
        res.json({
            ok: false,
            db: false,
            error: message,
        });
    }
});
// Scanner dashboard is the primary surface on this host
app.get("/", (_req, res) => {
    res.redirect(302, "/scanner/");
});
app.use("/api/auth", auth_1.authRouter);
app.use("/api/checkin", checkin_1.checkinRouter);
app.use("/api/staff", staff_1.staffRouter);
app.use("/api/analytics", analytics_1.analyticsRouter);
app.use("/api/ghl", ghl_1.ghlRouter);
// Staff scanner — Hostinger flattens to dist/scanner; local monorepo uses apps/scanner
const scannerCandidates = [
    path_1.default.resolve(__dirname, "scanner"), // dist/scanner (Hostinger prepare-hostinger)
    path_1.default.resolve(__dirname, "../../scanner"), // apps/api/dist → apps/scanner
    path_1.default.resolve(process.cwd(), "apps/scanner"),
    path_1.default.resolve(process.cwd(), "dist/scanner"),
];
const scannerDir = scannerCandidates.find((dir) => fs_1.default.existsSync(path_1.default.join(dir, "index.html"))) ??
    scannerCandidates[0];
console.log(`[static] scanner dir: ${scannerDir}`);
app.use("/scanner", express_1.default.static(scannerDir, {
    index: "index.html",
    etag: false,
    lastModified: false,
    setHeaders(res) {
        res.setHeader("Cache-Control", "no-store");
    },
}));
// Store listing legal pages (privacy / support / account deletion)
const legalCandidates = [
    path_1.default.resolve(__dirname, "legal"),
    path_1.default.resolve(__dirname, "../../legal"),
    path_1.default.resolve(process.cwd(), "apps/legal"),
    path_1.default.resolve(process.cwd(), "dist/legal"),
];
const legalDir = legalCandidates.find((dir) => fs_1.default.existsSync(path_1.default.join(dir, "privacy.html"))) ??
    legalCandidates[0];
console.log(`[static] legal dir: ${legalDir}`);
app.use("/legal", express_1.default.static(legalDir, {
    etag: false,
    lastModified: false,
    setHeaders(res) {
        res.setHeader("Cache-Control", "no-store");
    },
}));
app.use((err, _req, res, _next) => {
    console.error("Unhandled error", err);
    res.status(500).json({ error: "Internal server error" });
});
const httpServer = http_1.default.createServer(app);
let httpsServer = null;
const isProduction = config_1.env.NODE_ENV === "production";
// Hostinger (and similar) terminate TLS at the proxy — only listen HTTP there.
if (!isProduction) {
    const certPath = path_1.default.resolve(__dirname, "../certs/cert.pem");
    const keyPath = path_1.default.resolve(__dirname, "../certs/key.pem");
    if (fs_1.default.existsSync(certPath) && fs_1.default.existsSync(keyPath)) {
        httpsServer = https_1.default.createServer({
            cert: fs_1.default.readFileSync(certPath),
            key: fs_1.default.readFileSync(keyPath),
        }, app);
    }
    else {
        console.warn("[https] Missing apps/api/certs/cert.pem or key.pem — camera on phones needs HTTPS. Generate certs and restart.");
    }
}
const servers = [];
// Hostinger / reverse proxies need an explicit host bind
const listenHost = isProduction ? "0.0.0.0" : undefined;
httpServer.listen(config_1.env.PORT, listenHost, () => {
    console.log(`HTTP  API:  ${config_1.env.PUBLIC_BASE_URL} (port ${config_1.env.PORT})`);
    console.log(isProduction
        ? `Scanner: ${config_1.env.PUBLIC_BASE_URL}/scanner/`
        : `HTTP  Scanner (camera only works on localhost): ${config_1.env.PUBLIC_BASE_URL}/scanner/`);
    (0, outbox_1.startOutboxWorker)();
});
servers.push(httpServer);
if (httpsServer) {
    httpsServer.listen(config_1.env.HTTPS_PORT, () => {
        const httpsBase = config_1.env.PUBLIC_HTTPS_BASE_URL ||
            `https://localhost:${config_1.env.HTTPS_PORT}`;
        console.log(`HTTPS API:  ${httpsBase}`);
        console.log(`HTTPS Scanner (use this for camera on Chrome/phone): ${httpsBase}/scanner/`);
        console.log("Note: self-signed cert — accept the browser warning once (Advanced → Proceed).");
    });
    servers.push(httpsServer);
}
async function shutdown(signal) {
    console.log(`Received ${signal}, shutting down…`);
    (0, outbox_1.stopOutboxWorker)();
    await Promise.all(servers.map((s) => new Promise((resolve) => {
        s.close(() => resolve());
    })));
    await pool_1.pool.end();
    process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
//# sourceMappingURL=index.js.map