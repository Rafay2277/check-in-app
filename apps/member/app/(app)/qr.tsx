import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "../../src/auth";
import { BrandMark } from "../../src/BrandMark";
import { Screen } from "../../src/Screen";
import { colors, fonts, radii } from "../../src/theme";

export default function QrScreen() {
  const router = useRouter();
  const { member } = useAuth();
  const params = useLocalSearchParams<{ payload: string; expiresAt: string }>();
  const rawPayload = Array.isArray(params.payload)
    ? params.payload[0]
    : params.payload;
  const payload = rawPayload ? decodeURIComponent(String(rawPayload)).trim() : "";
  const expiresAtMs = useMemo(
    () => new Date(String(params.expiresAt)).getTime(),
    [params.expiresAt]
  );
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000))
  );

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(id);
  }, [expiresAtMs]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const expired = remaining <= 0;

  return (
    <Screen contentStyle={styles.safe}>
      <View style={styles.hero}>
        <BrandMark size={92} />
      </View>

      <View style={styles.card}>
        <BrandMark variant="gold" size={44} showWordmark={false} />
        <View style={styles.check}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
        <Text style={styles.title}>
          {expired ? "This code expired." : "You’re checked in."}
        </Text>
        <Text style={styles.copy}>
          {expired
            ? "Go back and check in again."
            : "Show this QR code to the barista to redeem your member coffee."}
        </Text>

        <View style={[styles.qrWrap, expired && styles.qrExpired]}>
          {payload ? (
            <QRCode
              value={payload}
              size={220}
              backgroundColor="#ffffff"
              color="#111111"
            />
          ) : (
            <Text style={styles.missing}>No check-in code on this screen.</Text>
          )}
        </View>

        {member?.name ? (
          <>
            <Text style={styles.memberLabel}>{member.name}</Text>
            <View style={styles.rule} />
          </>
        ) : null}
        <Text style={styles.timer}>
          {expired ? "Expired" : `Valid for ${mm}:${ss}`}
        </Text>

        <Pressable
          style={styles.done}
          onPress={() => router.replace("/(app)/home")}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    justifyContent: "space-between",
  },
  hero: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 12,
    opacity: 0.9,
  },
  card: {
    flexGrow: 1,
    backgroundColor: colors.bg1,
    borderRadius: radii.lg,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: "center",
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  checkMark: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 14,
    fontFamily: fonts.sansBold,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.sansSemi,
    fontSize: 22,
    marginTop: 12,
    textAlign: "center",
  },
  copy: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 18,
    paddingHorizontal: 6,
  },
  qrWrap: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  qrExpired: { opacity: 0.35 },
  missing: {
    color: colors.bg0,
    fontFamily: fonts.sansMedium,
    textAlign: "center",
  },
  memberLabel: {
    marginTop: 16,
    color: colors.ink,
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: colors.border,
    marginTop: 14,
    marginBottom: 12,
  },
  timer: {
    color: colors.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 0.6,
  },
  done: {
    marginTop: 18,
    alignSelf: "stretch",
    borderRadius: radii.md,
    backgroundColor: "#252830",
    paddingVertical: 16,
    alignItems: "center",
  },
  doneText: {
    color: colors.accentBright,
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
});
