import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const ACCESS_KEY = "checkin_access_token";
const REFRESH_KEY = "checkin_refresh_token";

export type Member = {
  id: string;
  name: string;
  phoneNumber: string;
  pointsTotal: number;
};

export type CheckinToken = {
  token: string;
  createdAt: string;
  expiresAt: string;
  expiresInSeconds: number;
  qrPayload: string;
};

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

  const data = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
  };
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

export async function startAuth(name: string, phone: string) {
  const res = await apiFetch("/api/auth/start", {
    method: "POST",
    body: JSON.stringify({ name, phone }),
  });
  const data = await res.json();
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
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Verification failed");
  }
  await saveSession(data.accessToken, data.refreshToken);
  return data.member as Member;
}

export async function fetchMe(): Promise<Member> {
  const res = await apiFetch("/api/checkin/me", {}, true);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load profile");
  return data as Member;
}

export async function createCheckinToken(): Promise<CheckinToken> {
  const res = await apiFetch(
    "/api/checkin/token",
    { method: "POST" },
    true
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not create check-in");
  return data as CheckinToken;
}

export async function deleteAccount(): Promise<void> {
  const res = await apiFetch("/api/auth/account", { method: "DELETE" }, true);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || "Could not delete account"
    );
  }
  await clearSession();
}

export const LEGAL_URLS = {
  privacy: "https://dashboard.nouraiz.com/legal/privacy.html",
  support: "https://dashboard.nouraiz.com/legal/support.html",
  deleteAccount: "https://dashboard.nouraiz.com/legal/delete-account.html",
};
