import { Image, StyleSheet, Text, View } from "react-native";
import { brand, colors, fonts } from "./theme";

const logos = {
  white: require("../assets/logo-wing.png"),
  gold: require("../assets/logo-wing-gold.png"),
  circle: require("../assets/logo-circle.png"),
};

type Props = {
  /** wing = Flying 4; circle = Circle 4; gold = sheet accent */
  variant?: "white" | "gold" | "circle";
  size?: number;
  showWordmark?: boolean;
};

export function BrandMark({
  variant = "white",
  size = 118,
  showWordmark = true,
}: Props) {
  const source =
    variant === "circle"
      ? logos.circle
      : variant === "gold"
        ? logos.gold
        : logos.white;

  // Circle asset is square; wing lockups are slightly wider than tall.
  const height = variant === "circle" ? size : size * 0.86;

  return (
    <View style={styles.wrap}>
      <Image
        source={source}
        style={{ width: size, height }}
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
