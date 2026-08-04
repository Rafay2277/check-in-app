import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { clearSession, fetchMe, getAccessToken, Member } from "./api";

type AuthContextValue = {
  ready: boolean;
  member: Member | null;
  setMember: (m: Member | null) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [member, setMember] = useState<Member | null>(null);

  const refreshProfile = useCallback(async () => {
    const me = await fetchMe();
    setMember(me);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const me = await fetchMe();
        if (!cancelled) setMember(me);
      } catch {
        await clearSession();
        if (!cancelled) setMember(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setMember(null);
  }, []);

  const value = useMemo(
    () => ({ ready, member, setMember, signOut, refreshProfile }),
    [ready, member, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth requires AuthProvider");
  return ctx;
}
