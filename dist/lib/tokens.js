"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashOpaqueToken = hashOpaqueToken;
exports.generateOpaqueToken = generateOpaqueToken;
exports.generateOtpCode = generateOtpCode;
exports.hashOtpCode = hashOtpCode;
exports.verifyOtpCode = verifyOtpCode;
exports.signAccessToken = signAccessToken;
exports.verifyAccessToken = verifyAccessToken;
exports.signStaffToken = signStaffToken;
exports.verifyStaffToken = verifyStaffToken;
exports.refreshExpiryDate = refreshExpiryDate;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const BCRYPT_ROUNDS = 10;
function hashOpaqueToken(raw) {
    return crypto_1.default.createHash("sha256").update(raw).digest("hex");
}
function generateOpaqueToken() {
    return crypto_1.default.randomBytes(32).toString("base64url");
}
function generateOtpCode() {
    return String(crypto_1.default.randomInt(100000, 999999));
}
async function hashOtpCode(code) {
    return bcryptjs_1.default.hash(code, BCRYPT_ROUNDS);
}
async function verifyOtpCode(code, hash) {
    return bcryptjs_1.default.compare(code, hash);
}
function signAccessToken(memberId) {
    const payload = { sub: memberId, typ: "access" };
    return jsonwebtoken_1.default.sign(payload, config_1.env.JWT_ACCESS_SECRET, {
        expiresIn: config_1.env.ACCESS_TOKEN_TTL_SECONDS,
    });
}
function verifyAccessToken(token) {
    const decoded = jsonwebtoken_1.default.verify(token, config_1.env.JWT_ACCESS_SECRET);
    if (decoded.typ !== "access" || !decoded.sub) {
        throw new Error("Invalid access token");
    }
    return decoded;
}
function signStaffToken() {
    const payload = {
        typ: "staff",
        sid: crypto_1.default.randomUUID(),
    };
    return jsonwebtoken_1.default.sign(payload, config_1.env.JWT_ACCESS_SECRET, {
        expiresIn: config_1.env.STAFF_SESSION_TTL_SECONDS,
    });
}
function verifyStaffToken(token) {
    const decoded = jsonwebtoken_1.default.verify(token, config_1.env.JWT_ACCESS_SECRET);
    if (decoded.typ !== "staff") {
        throw new Error("Invalid staff token");
    }
    return decoded;
}
function refreshExpiryDate() {
    return new Date(Date.now() + config_1.env.REFRESH_TOKEN_TTL_SECONDS * 1000);
}
//# sourceMappingURL=tokens.js.map