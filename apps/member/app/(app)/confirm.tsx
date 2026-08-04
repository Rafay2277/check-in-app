import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { createCheckinToken } from "../../src/api";
import { Screen } from "../../src/Screen";
import { colors, fonts } from "../../src/theme";

export default function ConfirmScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      const token = await createCheckinToken();
      router.replace({
        pathname: "/(app)/qr",
        params: {
          payload: token.qrPayload,
          expiresAt: token.expiresAt,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start check-in");
      setBusy(false);
    }
  }

  return (
    <Screen edges={["bottom"]} contentStyle={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.title}>Check in now?</Text>
        <Text style={styles.copy}>Did you bring your registered car today?</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.cta} onPress={onConfirm} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.ctaText} />
          ) : (
            <Text style={styles.ctaText}>Yes, I brought my car</Text>
          )}
        </Pressable>
        <Pressable
          style={styles.ghost}
          onPress={() => router.back()}
          disabled={busy}
        >
          <Text style={styles.ghostText}>No, just here for coffee</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: {
    paddingBottom: 24,
    justifyContent: "space-between",
  },
  body: { paddingTop: 24, gap: 12 },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 30,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  copy: {
    color: colors.muted,
    fontFamily: fonts.serif,
    fontSize: 16,
    lineHeight: 24,
  },
  error: { color: colors.bad, fontFamily: fonts.sansMedium },
  actions: { gap: 10 },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 2,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaText: {
    color: colors.ctaText,
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  ghost: {
    borderRadius: 2,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostText: {
    color: colors.muted,
    fontFamily: fonts.sansSemi,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
});
