import { Image, StyleSheet, Text, View } from "react-native";
import { brand, colors, fonts } from "./theme";

const logos = {
  white: require("../assets/logo-wing.png"),
  gold: require("../assets/logo-wing-gold.png"),
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
  if (variant === "circle") {
    const diameter = size;
    return (
      <View style={styles.wrap}>
        <View
          style={[
            styles.circle,
            {
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
            },
          ]}
        >
          <Text style={[styles.circleFour, { fontSize: diameter * 0.52 }]}>
            4
          </Text>
        </View>
        {showWordmark ? (
          <Text style={styles.wordmark}>{brand.lockup}</Text>
        ) : null}
      </View>
    );
  }

  const source = variant === "gold" ? logos.gold : logos.white;
  return (
    <View style={styles.wrap}>
      <Image
        source={source}
        style={{ width: size, height: size * 0.86 }}
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
  circle: {
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  circleFour: {
    color: "#111111",
    fontFamily: fonts.sansBold,
    includeFontPadding: false,
    textAlign: "center",
  },
  wordmark: {
    color: colors.ink,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 7,
    textTransform: "uppercase",
  },
});
