/**
 * `expo start --tunnel` uses @expo/ws-tunnel, which needs ws@8 (peer dep).
 * With legacy-peer-deps=true npm skips that peer, so the tunnel resolves the
 * hoisted ws@7 and crashes with "s.WebSocket is not a constructor".
 * Give @expo/ws-tunnel its own ws@8 copy (dev tooling only; not in the app bundle).
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "node_modules");
const tunnelDir = path.join(root, "@expo", "ws-tunnel");
if (!fs.existsSync(tunnelDir)) process.exit(0);

function wsMajor(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    return Number(String(pkg.version).split(".")[0]);
  } catch {
    return 0;
  }
}

const target = path.join(tunnelDir, "node_modules", "ws");
if (wsMajor(target) >= 8) process.exit(0);

const sources = [
  path.join(root, "@expo", "cli", "node_modules", "ws"),
  path.join(root, "ws"),
];
const source = sources.find((dir) => wsMajor(dir) >= 8);
if (!source) {
  console.warn("[fix-ws-tunnel] no ws@8 found; `expo start --tunnel` may fail");
  process.exit(0);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });
console.log(`[fix-ws-tunnel] linked ws@8 for @expo/ws-tunnel from ${path.relative(root, source)}`);
