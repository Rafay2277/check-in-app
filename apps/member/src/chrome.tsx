import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, fonts, radii } from "./theme";

export function GoldButton({
  label,
  onPress,
  disabled,
  loading,
  leading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  leading?: ReactNode;
}) {
  return (
    <Pressable
      style={[styles.gold, (disabled || loading) && styles.disabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={colors.ctaText} />
      ) : (
        <View style={styles.row}>
          {leading}
          <Text style={styles.goldText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.ghost, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

export function Hairline() {
  return <View style={styles.hair} />;
}

export function QrGlyph() {
  return (
    <View style={styles.qr}>
      <View style={styles.qrDot} />
      <View style={styles.qrDot} />
      <View style={styles.qrDot} />
      <View style={[styles.qrDot, { opacity: 0.45 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  gold: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 17,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    alignSelf: "stretch",
  },
  goldText: {
    color: colors.ctaText,
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1.7,
    textTransform: "uppercase",
  },
  ghost: {
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(238, 227, 207, 0.28)",
    alignSelf: "stretch",
  },
  ghostText: {
    color: colors.ink,
    fontFamily: fonts.sansSemi,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  disabled: { opacity: 0.45 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  hair: {
    height: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: colors.border,
    marginVertical: 10,
  },
  qr: {
    width: 14,
    height: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  qrDot: {
    width: 6,
    height: 6,
    backgroundColor: colors.ctaText,
    borderRadius: 1,
  },
});
