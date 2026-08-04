import { env } from "../config";

export async function sendSmsOtp(phoneE164: string, code: string): Promise<void> {
  if (env.MOCK_INTEGRATIONS) {
    console.log(`[MOCK Twilio] OTP ${code} → ${phoneE164}`);
    return;
  }

  const auth = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`
  ).toString("base64");

  const body = new URLSearchParams({
    To: phoneE164,
    From: env.TWILIO_FROM_NUMBER,
    Body: `Your check-in verification code is ${code}. It expires in 10 minutes.`,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio SMS failed (${res.status}): ${text}`);
  }
}
