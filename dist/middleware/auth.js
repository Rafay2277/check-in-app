"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireMemberAuth = requireMemberAuth;
exports.requireStaffAuth = requireStaffAuth;
const tokens_1 = require("../lib/tokens");
function requireMemberAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Missing or invalid Authorization header" });
        return;
    }
    try {
        const payload = (0, tokens_1.verifyAccessToken)(header.slice(7));
        req.memberId = payload.sub;
        next();
    }
    catch {
        res.status(401).json({ error: "Invalid or expired access token" });
    }
}
function requireStaffAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Staff session required" });
        return;
    }
    try {
        const payload = (0, tokens_1.verifyStaffToken)(header.slice(7));
        req.staffSessionId = payload.sid;
        next();
    }
    catch {
        res.status(401).json({ error: "Invalid or expired staff session" });
    }
}
//# sourceMappingURL=auth.js.map