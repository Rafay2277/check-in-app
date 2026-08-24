import { useRouter } from "expo-router";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { LEGAL_URLS } from "../../src/api";
import { BrandMark } from "../../src/BrandMark";
import { GoldButton } from "../../src/chrome";
import { Screen } from "../../src/Screen";
import { colors, fonts } from "../../src/theme";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen contentStyle={styles.safe}>
      <View style={styles.hero}>
        <BrandMark size={168} />
      </View>
      <View style={styles.footer}>
        <GoldButton
          label="Get started"
          onPress={() => router.push("/(auth)/login")}
        />
        <View style={styles.legalRow}>
          <Pressable onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}>
            <Text style={styles.legalLink}>Privacy</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={() => void Linking.openURL(LEGAL_URLS.terms)}>
            <Text style={styles.legalLink}>Terms</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={() => void Linking.openURL(LEGAL_URLS.support)}>
            <Text style={styles.legalLink}>Support</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: {
    paddingBottom: 28,
    justifyContent: "space-between",
  },
  hero: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    gap: 16,
  },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  legalLink: {
    color: colors.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  legalDot: {
    color: colors.border,
    fontSize: 12,
  },
});
