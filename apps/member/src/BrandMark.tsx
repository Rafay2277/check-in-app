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
    // Circle mark reads smaller than the winged logo at the same size prop.
    const diameter = size * 1.18;
    // Montserrat Bold "4" sits high in the em-box; push down + slight left
    // so it reads optically centered in the circle.
    const fontSize = diameter * 0.52;
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
          <Text
            style={[
              styles.circleFour,
              {
                fontSize,
                lineHeight: fontSize * 1.05,
                height: fontSize * 1.05,
                marginTop: diameter * 0.06,
                transform: [{ translateX: -diameter * 0.02 }],
              },
            ]}
          >
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
    textAlignVertical: "center",
  },
  wordmark: {
    color: colors.ink,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 7,
    textTransform: "uppercase",
  },
});
