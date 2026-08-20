import { Image, StyleSheet, Text, View } from "react-native";
import { brand, colors, fonts } from "./theme";

const logos = {
  white: require("../assets/logo-wing.png"),
  gold: require("../assets/logo-wing-gold.png"),
};

type Props = {
  variant?: "white" | "gold";
  size?: number;
  showWordmark?: boolean;
};

export function BrandMark({
  variant = "white",
  size = 118,
  showWordmark = true,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Image
        source={logos[variant]}
        style={{ width: size, height: size * 0.74 }}
        resizeMode="contain"
      />
      {showWordmark ? (
        <Text
          style={[
            styles.wordmark,
            variant === "gold" && { color: colors.accentBright },
          ]}
        >
          {brand.lockup}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    alignSelf: "stretch",
    gap: 10,
  },
  wordmark: {
    color: colors.ink,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 7,
    textTransform: "uppercase",
  },
});
