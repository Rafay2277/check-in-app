import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../../src/auth";
import { BrandMark } from "../../src/BrandMark";
import {
  GhostButton,
  GoldButton,
  Hairline,
  QrGlyph,
  tierMarkVariant,
} from "../../src/chrome";
import { membershipTheme } from "../../src/membershipTheme";
import { Screen } from "../../src/Screen";
import { colors, fonts } from "../../src/theme";

export default function HomeScreen() {
  const router = useRouter();
  const { member, refreshProfile, signOut } = useAuth();
  const tier = member?.membershipTier;
  const theme = membershipTheme(tier);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!member);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        setError(null);
        try {
          await refreshProfile();
        } catch (err) {
          if (active) {
            setError(err instanceof Error ? err.message : "Failed to load");
          }
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [refreshProfile])
  );

  async function onSignOut() {
    await signOut();
    router.replace("/(auth)/welcome");
  }

  const first = member?.name?.split(" ")[0];

  return (
    <Screen contentStyle={styles.safe} membershipTier={tier}>
      <View style={styles.body}>
        <BrandMark variant={tierMarkVariant(tier, "hero")} size={88} />
        {loading ? (
          <ActivityIndicator
            color={colors.accentBright}
            style={{ marginTop: 28 }}
          />
        ) : (
          <View style={styles.meta}>
            <Text style={styles.since}>
              {first ? `Hi, ${first}` : "Member"}
            </Text>
            <Hairline />
            <Text style={styles.label}>Check-in points</Text>
            <Text style={styles.points}>{member?.pointsTotal ?? 0}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <GoldButton
          label={member?.checkedInToday ? "Checked in today" : "Check in"}
          leading={<QrGlyph color={theme.primaryButtonText} />}
          onPress={() =>
            router.push(
              member?.checkedInToday
                ? "/(app)/already-today"
                : "/(app)/confirm"
            )
          }
          disabled={loading}
          membershipTier={tier}
        />
        <GhostButton
          label="Account"
          onPress={() => router.push("/(app)/account")}
          disabled={loading}
          membershipTier={tier}
        />
        <GhostButton
          label="Sign out"
          onPress={onSignOut}
          disabled={loading}
          membershipTier={tier}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: {
    paddingBottom: 18,
    justifyContent: "space-between",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 12,
  },
  meta: {
    marginTop: 88,
    alignItems: "center",
    width: "78%",
  },
  since: {
    color: colors.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  label: {
    color: colors.accentBright,
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  points: {
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 72,
    lineHeight: 80,
    marginTop: 4,
    letterSpacing: 1,
  },
  error: {
    color: colors.bad,
    marginTop: 10,
    fontFamily: fonts.sansMedium,
    textAlign: "center",
  },
  actions: { gap: 10 },
});
