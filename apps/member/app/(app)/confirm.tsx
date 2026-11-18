import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiError, createCheckinToken } from "../../src/api";
import { useAuth } from "../../src/auth";
import { BrandMark } from "../../src/BrandMark";
import { GhostButton, GoldButton, tierMarkVariant } from "../../src/chrome";
import { Screen } from "../../src/Screen";
import { colors, fonts, radii } from "../../src/theme";

export default function ConfirmScreen() {
  const router = useRouter();
  const { member } = useAuth();
  const tier = member?.membershipTier;
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
      if (err instanceof ApiError && err.code === "ALREADY_CHECKED_IN_TODAY") {
        router.replace("/(app)/already-today");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not start check-in");
      setBusy(false);
    }
  }

  const sheetMark = tierMarkVariant(tier, "sheet");
  const flying = tier === "premium";

  return (
    <Screen contentStyle={styles.safe} membershipTier={tier}>
      <View style={styles.hero}>
        <BrandMark variant={tierMarkVariant(tier, "hero")} size={150} />
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        {sheetMark ? (
          <BrandMark variant={sheetMark} size={52} showWordmark={false} />
        ) : null}
        <Text style={styles.title}>
          {flying ? "Did you bring your car today?" : "Ready to check in?"}
        </Text>
        <Text style={styles.copy}>
          {flying
            ? "Members enjoy one complimentary coffee per visit when they bring their registered car."
            : "Show your QR to staff at the counter to record your visit."}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <GoldButton
            label={flying ? "Yes, I brought my car" : "Check in"}
            onPress={onConfirm}
            loading={busy}
            membershipTier={tier}
          />
          <GhostButton
            label={flying ? "No, just here for coffee" : "Not now"}
            onPress={() => router.back()}
            disabled={busy}
            membershipTier={tier}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: {
    paddingHorizontal: 0,
    justifyContent: "space-between",
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    opacity: 0.92,
  },
  sheet: {
    backgroundColor: colors.bg1,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 12,
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(238, 227, 207, 0.22)",
    marginBottom: 8,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.sansSemi,
    fontSize: 22,
    textAlign: "center",
    marginTop: 4,
  },
  copy: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  error: {
    color: colors.bad,
    fontFamily: fonts.sansMedium,
    textAlign: "center",
  },
  actions: {
    alignSelf: "stretch",
    gap: 10,
    marginTop: 4,
  },
});
