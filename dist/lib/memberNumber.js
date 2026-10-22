"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureMemberNumberSchema = ensureMemberNumberSchema;
let memberNumberSchemaReady = false;
/**
 * Hostinger often sets SKIP_MIGRATE_ON_START=true, so 006 may never run.
 * Add members.member_number idempotently at runtime.
 */
async function ensureMemberNumberSchema(client) {
    if (memberNumberSchemaReady)
        return;
    const run = async (c) => {
        await c.query(`
      ALTER TABLE members
        ADD COLUMN IF NOT EXISTS member_number TEXT;
    `);
        try {
            await c.query(`INSERT INTO schema_migrations (filename) VALUES ($1)
         ON CONFLICT (filename) DO NOTHING`, ["006_member_number.sql"]);
        }
        catch {
            // schema_migrations may not exist in odd setups
        }
    };
    if (client) {
        await run(client);
    }
    else {
        const { pool } = await Promise.resolve().then(() => __importStar(require("../db/pool")));
        const c = await pool.connect();
        try {
            await run(c);
        }
        finally {
            c.release();
        }
    }
    memberNumberSchemaReady = true;
    console.log("[memberNumber] members.member_number schema ready");
}
//# sourceMappingURL=memberNumber.js.map