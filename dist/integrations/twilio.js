"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSmsOtp = sendSmsOtp;
const config_1 = require("../config");
async function sendSmsOtp(phoneE164, code) {
    if (config_1.env.MOCK_INTEGRATIONS) {
        console.log(`[MOCK Twilio] OTP ${code} → ${phoneE164}`);
        return;
    }
    const auth = Buffer.from(`${config_1.env.TWILIO_ACCOUNT_SID}:${config_1.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const body = new URLSearchParams({
        To: phoneE164,
        From: config_1.env.TWILIO_FROM_NUMBER,
        Body: `Your check-in verification code is ${code}. It expires in 10 minutes.`,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config_1.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Twilio SMS failed (${res.status}): ${text}`);
    }
}
//# sourceMappingURL=twilio.js.map