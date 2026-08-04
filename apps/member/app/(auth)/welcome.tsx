import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../src/Screen";
import { brand, colors, fonts } from "../../src/theme";

export default function WelcomeScreen() {
  return (
    <Screen contentStyle={styles.safe}>
      <View style={styles.hero}>
        <Text style={styles.brand}>{brand.name}</Text>
        <Text style={styles.kicker}>Member check-in</Text>
        <Text style={styles.title}>
          Specialty coffee.{"\n"}Automotive culture.
        </Text>
        <Text style={styles.copy}>
          Sign in with your loyalty phone number, then show a one-time QR at the
          counter for your check-in punch.
        </Text>
      </View>
      <Link href="/(auth)/login" asChild>
        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>Get started</Text>
        </Pressable>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: {
    paddingBottom: 24,
    justifyContent: "space-between",
  },
  hero: {
    flex: 1,
    justifyContent: "center",
    gap: 12,
  },
  brand: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 36,
    letterSpacing: 0.5,
    textTransform: "lowercase",
  },
  kicker: {
    color: colors.accentBright,
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: "uppercase",
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 8,
  },
  copy: {
    color: colors.muted,
    fontFamily: fonts.serif,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 320,
    marginTop: 4,
  },
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
});
