import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../../src/auth";
import { BrandMark } from "../../src/BrandMark";
import { GoldButton, Hairline, QrGlyph } from "../../src/chrome";
import { Screen } from "../../src/Screen";
import { colors, fonts } from "../../src/theme";

export default function HomeScreen() {
  const router = useRouter();
  const { member, refreshProfile, signOut } = useAuth();
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
    <Screen contentStyle={styles.safe}>
      <View style={styles.body}>
        <BrandMark size={150} />
        {loading ? (
          <ActivityIndicator
            color={colors.accentBright}
            style={{ marginTop: 36 }}
          />
        ) : (
          <View style={styles.meta}>
            <Text style={styles.label}>Check-in points</Text>
            <Text style={styles.points}>{member?.pointsTotal ?? 0}</Text>
            <Hairline />
            <Text style={styles.since}>
              {first ? `Hi, ${first}` : "Member"}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <GoldButton
          label="Check in"
          leading={<QrGlyph />}
          onPress={() => router.push("/(app)/confirm")}
          disabled={loading}
        />
        <Pressable style={styles.signOut} onPress={onSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
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
    paddingBottom: 24,
  },
  meta: {
    marginTop: 36,
    alignItems: "center",
    width: "72%",
  },
  label: {
    color: colors.accentBright,
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: "uppercase",
  },
  points: {
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 72,
    lineHeight: 80,
    marginTop: 6,
    letterSpacing: 1,
  },
  since: {
    color: colors.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  error: {
    color: colors.bad,
    marginTop: 10,
    fontFamily: fonts.sansMedium,
    textAlign: "center",
  },
  actions: { gap: 8 },
  signOut: {
    paddingVertical: 12,
    alignItems: "center",
  },
  signOutText: {
    color: colors.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
});
