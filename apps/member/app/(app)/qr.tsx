import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Screen } from "../../src/Screen";
import { colors, fonts } from "../../src/theme";

export default function QrScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload: string; expiresAt: string }>();
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
    <Screen edges={["bottom"]} contentStyle={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.title}>Show this to staff</Text>
        <Text style={styles.copy}>
          {expired
            ? "This code expired. Go back and check in again."
            : "Hold steady at the counter while staff scans."}
        </Text>

        <View style={[styles.qrWrap, expired && styles.qrExpired]}>
          {params.payload ? (
            <QRCode
              value={String(params.payload)}
              size={240}
              backgroundColor={colors.parchment}
              color={colors.bg0}
            />
          ) : null}
        </View>

        <Text style={styles.timer}>
          {expired ? "Expired" : `Valid for ${mm}:${ss}`}
        </Text>
      </View>

      <Pressable
        style={styles.ghost}
        onPress={() => router.replace("/(app)/home")}
      >
        <Text style={styles.ghostText}>Done</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: {
    paddingBottom: 24,
    justifyContent: "space-between",
  },
  body: {
    alignItems: "center",
    paddingTop: 12,
    gap: 12,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    alignSelf: "stretch",
  },
  copy: {
    color: colors.muted,
    fontFamily: fonts.serif,
    fontSize: 15,
    lineHeight: 22,
    alignSelf: "stretch",
  },
  qrWrap: {
    marginTop: 16,
    padding: 18,
    borderRadius: 4,
    backgroundColor: colors.parchment,
  },
  qrExpired: { opacity: 0.35 },
  timer: {
    marginTop: 8,
    color: colors.accentBright,
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1.5,
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
