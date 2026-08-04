import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js";
import { env } from "../config";

export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const phone = parsePhoneNumberFromString(
    trimmed,
    env.DEFAULT_PHONE_COUNTRY as CountryCode
  );
  if (!phone || !phone.isValid()) {
    return null;
  }
  return phone.format("E.164");
}
