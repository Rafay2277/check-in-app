import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BrandMark } from "../../src/BrandMark";
import { Screen } from "../../src/Screen";
import { colors, fonts, radii } from "../../src/theme";

export default function AlreadyTodayScreen() {
  const router = useRouter();

  return (
    <Screen contentStyle={styles.safe}>
      <View style={styles.hero}>
        <BrandMark size={92} />
      </View>
      <View style={styles.card}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✓</Text>
        </View>
        <Text style={styles.title}>Already checked in today</Text>
        <Text style={styles.copy}>
          Your visit for today has already been recorded. One check-in is
          available per day — we look forward to seeing you again tomorrow.
        </Text>
        <Pressable
          style={styles.done}
          onPress={() => router.replace("/(app)/home")}
        >
          <Text style={styles.doneText}>Back to home</Text>
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
    paddingTop: 28,
    paddingBottom: 18,
    alignItems: "center",
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(163, 158, 122, 0.18)",
    borderWidth: 1.5,
    borderColor: colors.accentBright,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  badgeText: {
    color: colors.accentBright,
    fontSize: 34,
    lineHeight: 38,
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
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 24,
    paddingHorizontal: 6,
  },
  done: {
    marginTop: "auto",
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
