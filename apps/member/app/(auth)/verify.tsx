import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { startAuth, verifyAuth } from "../../src/api";
import { useAuth } from "../../src/auth";
import { Screen } from "../../src/Screen";
import { colors, fonts } from "../../src/theme";

export default function VerifyScreen() {
  const router = useRouter();
  const { setMember } = useAuth();
  const params = useLocalSearchParams<{ phone: string; name: string }>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function onVerify() {
    setError(null);
    setBusy(true);
    try {
      const member = await verifyAuth(String(params.phone), code.trim());
      setMember(member);
      router.replace("/(app)/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (cooldown > 0 || !params.phone || !params.name) return;
    setError(null);
    try {
      await startAuth(String(params.name), String(params.phone));
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend");
    }
  }

  return (
    <Screen edges={["bottom"]} contentStyle={styles.safe}>
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.form}>
          <Text style={styles.copy}>
            Enter the 6-digit code sent to{" "}
            <Text style={styles.phone}>{params.phone}</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            placeholderTextColor={colors.muted}
            textContentType="oneTimeCode"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={onResend} disabled={cooldown > 0}>
            <Text style={[styles.resend, cooldown > 0 && styles.resendDisabled]}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </Text>
          </Pressable>
        </View>
        <Pressable
          style={[styles.cta, (code.length !== 6 || busy) && styles.ctaDisabled]}
          disabled={code.length !== 6 || busy}
          onPress={onVerify}
        >
          {busy ? (
            <ActivityIndicator color={colors.ctaText} />
          ) : (
            <Text style={styles.ctaText}>Verify</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { paddingBottom: 24 },
  wrap: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 8,
  },
  form: { gap: 14 },
  copy: {
    color: colors.muted,
    fontFamily: fonts.serif,
    fontSize: 16,
    lineHeight: 24,
  },
  phone: {
    color: colors.ink,
    fontFamily: fonts.sansBold,
  },
  input: {
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 2,
    color: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 28,
    letterSpacing: 10,
    textAlign: "center",
    fontFamily: fonts.sansBold,
  },
  error: { color: colors.bad, fontFamily: fonts.sansMedium },
  resend: {
    color: colors.accentBright,
    fontFamily: fonts.sansSemi,
    marginTop: 4,
  },
  resendDisabled: { color: colors.muted },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 2,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: {
    color: colors.ctaText,
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
});
