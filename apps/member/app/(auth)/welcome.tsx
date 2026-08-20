import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { BrandMark } from "../../src/BrandMark";
import { GoldButton } from "../../src/chrome";
import { Screen } from "../../src/Screen";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen contentStyle={styles.safe}>
      <View style={styles.hero}>
        <BrandMark size={168} />
      </View>
      <GoldButton label="Get started" onPress={() => router.push("/(auth)/login")} />
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
});
