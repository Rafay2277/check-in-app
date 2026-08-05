import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import express from "express";
import cors from "cors";
import { assertLiveIntegrationsConfigured, env } from "./config";
import { authRouter } from "./routes/auth";
import { checkinRouter } from "./routes/checkin";
import { staffRouter } from "./routes/staff";
import { analyticsRouter } from "./routes/analytics";
import { ghlRouter } from "./routes/ghl";
import { startOutboxWorker, stopOutboxWorker } from "./worker/outbox";
import { pool } from "./db/pool";

assertLiveIntegrationsConfigured();

process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[fatal] unhandledRejection", err);
});

const app = express();

app.use(cors());
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mockIntegrations: env.MOCK_INTEGRATIONS,
    skipSmsOtp: env.SKIP_SMS_OTP,
    httpsPort: env.HTTPS_PORT,
  });
});

// Scanner dashboard is the primary surface on this host
app.get("/", (_req, res) => {
  res.redirect(302, "/scanner/");
});

app.use("/api/auth", authRouter);
app.use("/api/checkin", checkinRouter);
app.use("/api/staff", staffRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/ghl", ghlRouter);

// Staff scanner — same Express host at /scanner
const scannerDir = path.resolve(__dirname, "../../scanner");
app.use("/scanner", express.static(scannerDir, { index: "index.html" }));

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

const httpServer = http.createServer(app);

let httpsServer: https.Server | null = null;
const isProduction = env.NODE_ENV === "production";

// Hostinger (and similar) terminate TLS at the proxy — only listen HTTP there.
if (!isProduction) {
  const certPath = path.resolve(__dirname, "../certs/cert.pem");
  const keyPath = path.resolve(__dirname, "../certs/key.pem");

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    httpsServer = https.createServer(
      {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      },
      app
    );
  } else {
    console.warn(
      "[https] Missing apps/api/certs/cert.pem or key.pem — camera on phones needs HTTPS. Generate certs and restart."
    );
  }
}

const servers: Array<http.Server | https.Server> = [];

// Hostinger / reverse proxies need an explicit host bind
const listenHost = isProduction ? "0.0.0.0" : undefined;

httpServer.listen(env.PORT, listenHost, () => {
  console.log(`HTTP  API:  ${env.PUBLIC_BASE_URL} (port ${env.PORT})`);
  console.log(
    isProduction
      ? `Scanner: ${env.PUBLIC_BASE_URL}/scanner/`
      : `HTTP  Scanner (camera only works on localhost): ${env.PUBLIC_BASE_URL}/scanner/`
  );
  startOutboxWorker();
});
servers.push(httpServer);

if (httpsServer) {
  httpsServer.listen(env.HTTPS_PORT, () => {
    const httpsBase =
      env.PUBLIC_HTTPS_BASE_URL ||
      `https://localhost:${env.HTTPS_PORT}`;
    console.log(`HTTPS API:  ${httpsBase}`);
    console.log(`HTTPS Scanner (use this for camera on Chrome/phone): ${httpsBase}/scanner/`);
    console.log(
      "Note: self-signed cert — accept the browser warning once (Advanced → Proceed)."
    );
  });
  servers.push(httpsServer);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down…`);
  stopOutboxWorker();
  await Promise.all(
    servers.map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
        })
    )
  );
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
