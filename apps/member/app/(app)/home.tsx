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
import { Screen } from "../../src/Screen";
import { brand, colors, fonts } from "../../src/theme";

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

  return (
    <Screen contentStyle={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.brand}>{brand.name}</Text>
        {loading ? (
          <ActivityIndicator
            color={colors.accentBright}
            style={{ marginTop: 40 }}
          />
        ) : (
          <>
            <Text style={styles.hello}>
              Hi{member?.name ? `, ${member.name.split(" ")[0]}` : ""}
            </Text>
            <Text style={styles.points}>
              {member?.pointsTotal ?? 0}
              <Text style={styles.pointsLabel}> check-in points</Text>
            </Text>
            <Text style={styles.copy}>
              Ready at the counter? Confirm check-in to show a one-time QR for
              staff to scan.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.cta}
          onPress={() => router.push("/(app)/confirm")}
          disabled={loading}
        >
          <Text style={styles.ctaText}>Check in</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={onSignOut}>
          <Text style={styles.ghostText}>Sign out</Text>
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
  body: { paddingTop: 12, gap: 10 },
  brand: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 28,
    letterSpacing: 0.4,
    textTransform: "lowercase",
    marginBottom: 10,
  },
  hello: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 30,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  points: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 42,
    marginTop: 10,
  },
  pointsLabel: {
    color: colors.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  copy: {
    color: colors.muted,
    fontFamily: fonts.serif,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
    maxWidth: 340,
  },
  error: {
    color: colors.bad,
    marginTop: 8,
    fontFamily: fonts.sansMedium,
  },
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
