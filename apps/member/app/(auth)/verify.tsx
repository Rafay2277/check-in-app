import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
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
import { BrandMark } from "../../src/BrandMark";
import { GoldButton } from "../../src/chrome";
import { Screen } from "../../src/Screen";
import { colors, fonts, radii } from "../../src/theme";

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
    <Screen contentStyle={styles.safe}>
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View>
          <BrandMark size={72} />
          <Text style={styles.title}>Enter your code.</Text>
          <Text style={styles.copy}>
            Sent to <Text style={styles.phone}>{params.phone}</Text>
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
        <GoldButton
          label="Verify"
          onPress={onVerify}
          loading={busy}
          disabled={code.length !== 6}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { paddingBottom: 28 },
  wrap: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 8,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.sansSemi,
    fontSize: 26,
    textAlign: "center",
    marginTop: 28,
  },
  copy: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 15,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  phone: {
    color: colors.ink,
    fontFamily: fonts.sansSemi,
  },
  input: {
    backgroundColor: colors.input,
    borderRadius: radii.sm,
    color: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 28,
    letterSpacing: 10,
    textAlign: "center",
    fontFamily: fonts.sansBold,
  },
  error: {
    color: colors.bad,
    marginTop: 12,
    fontFamily: fonts.sansMedium,
    textAlign: "center",
  },
  resend: {
    color: colors.accentBright,
    fontFamily: fonts.sansSemi,
    marginTop: 16,
    textAlign: "center",
  },
  resendDisabled: { color: colors.muted },
});
