import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const ACCESS_KEY = "checkin_access_token";
const REFRESH_KEY = "checkin_refresh_token";

export type MembershipTier = "premium" | "standard";

export type Member = {
  id: string;
  name: string;
  phoneNumber: string;
  pointsTotal: number;
  /** Cafe member # from GHL {{contact.member_number}}; null if unset */
  memberNumber?: string | null;
  /** premium = Flying 4 / Active Member; standard = Circle 4 / Car Community */
  membershipTier?: MembershipTier;
  checkedInToday?: boolean;
  checkinDate?: string;
};

export type CheckinToken = {
  token: string;
  createdAt: string;
  expiresAt: string;
  expiresInSeconds: number;
  qrPayload: string;
};

export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}
function apiBase(): string {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  return extra?.apiBaseUrl || process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000";
}

export async function saveSession(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${apiBase()}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    await clearSession();
    return null;
  }

  let data: { accessToken: string; refreshToken: string };
  try {
    data = (await readJson(res)) as {
      accessToken: string;
      refreshToken: string;
    };
  } catch {
    await clearSession();
    return null;
  }
  // Rotating refresh: always persist the new pair
  await saveSession(data.accessToken, data.refreshToken);
  return data.accessToken;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  auth = false
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    let access = await getAccessToken();
    if (!access) {
      access = await refreshAccessToken();
    }
    if (!access) {
      throw new Error("Not authenticated");
    }
    headers.set("Authorization", `Bearer ${access}`);

    const res = await fetch(`${apiBase()}${path}`, { ...init, headers });
    if (res.status !== 401) return res;

    const rotated = await refreshAccessToken();
    if (!rotated) return res;
    headers.set("Authorization", `Bearer ${rotated}`);
    return fetch(`${apiBase()}${path}`, { ...init, headers });
  }

  return fetch(`${apiBase()}${path}`, { ...init, headers });
}

/**
 * Parse API JSON safely. Hostinger/CDN outages and Express HTML error pages
 * start with `<`, which produces the confusing "Unexpected character: <" message.
 */
async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    const looksHtml = /^\s*</.test(text);
    throw new Error(
      looksHtml
        ? "Server temporarily unavailable. Please try again in a moment."
        : "Unexpected server response. Please try again."
    );
  }
}

export async function startAuth(name: string, phone: string) {
  const res = await apiFetch("/api/auth/start", {
    method: "POST",
    body: JSON.stringify({ name, phone }),
  });
  const data = await readJson<{
    error?: string;
    skippedOtp?: boolean;
    accessToken?: string;
    refreshToken?: string;
    phone?: string;
    member?: Member;
    expiresInSeconds?: number;
    resendAvailableInSeconds?: number;
  }>(res);
  if (!res.ok) {
    throw new Error(data.error || "Could not start verification");
  }

  if (data.skippedOtp && data.accessToken && data.refreshToken) {
    await saveSession(data.accessToken, data.refreshToken);
    return {
      skippedOtp: true as const,
      phone: data.phone as string,
      member: data.member as Member,
    };
  }

  return {
    skippedOtp: false as const,
    phone: data.phone as string,
    expiresInSeconds: data.expiresInSeconds as number,
    resendAvailableInSeconds: data.resendAvailableInSeconds as number,
  };
}

export async function verifyAuth(phone: string, code: string) {
  const res = await apiFetch("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
  const data = await readJson<{
    error?: string;
    accessToken: string;
    refreshToken: string;
    member: Member;
  }>(res);
  if (!res.ok) {
    throw new Error(data.error || "Verification failed");
  }
  await saveSession(data.accessToken, data.refreshToken);
  return data.member;
}

export async function fetchMe(): Promise<Member> {
  const res = await apiFetch("/api/checkin/me", {}, true);
  const data = await readJson<Member & { error?: string }>(res);
  if (!res.ok) throw new Error(data.error || "Failed to load profile");
  return data;
}

export async function createCheckinToken(): Promise<CheckinToken> {
  const res = await apiFetch(
    "/api/checkin/token",
    { method: "POST" },
    true
  );
  const data = await readJson<CheckinToken & { error?: string; code?: string }>(
    res
  );
  if (!res.ok) {
    throw new ApiError(
      data.error || "Could not create check-in",
      data.code
    );
  }
  return data;
}

export type CheckinTokenStatus = {
  status: "unused" | "used" | "expired" | "unknown" | string;
  usedAt: string | null;
  expiresAt: string;
  pointsTotal: number;
};

/** Poll while QR is shown — becomes `used` after staff scan. */
export async function fetchCheckinTokenStatus(
  token: string
): Promise<CheckinTokenStatus> {
  const res = await apiFetch(
    `/api/checkin/token/${encodeURIComponent(token)}/status`,
    {},
    true
  );
  const data = await readJson<CheckinTokenStatus & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.error || "Could not check status");
  }
  return data;
}

export async function deleteAccount(): Promise<void> {
  const res = await apiFetch("/api/auth/account", { method: "DELETE" }, true);
  const data = await readJson<{ error?: string }>(res).catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Could not delete account");
  }
  await clearSession();
}

export const LEGAL_URLS = {
  privacy: "https://fourtillfour.com/pages/app-privacy-policy",
  terms: "https://fourtillfour.com/pages/app-terms-of-use",
  support: "https://fourtillfour.com/pages/app-support",
  deleteAccount: "https://fourtillfour.com/pages/app-delete-account",
};
