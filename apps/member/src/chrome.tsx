import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MembershipTier } from "./api";
import { membershipTheme } from "./membershipTheme";
import { colors, fonts, radii } from "./theme";

export function GoldButton({
  label,
  onPress,
  disabled,
  loading,
  leading,
  membershipTier,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  leading?: ReactNode;
  membershipTier?: MembershipTier | null;
}) {
  const theme = membershipTheme(membershipTier);
  return (
    <Pressable
      style={[
        styles.gold,
        { backgroundColor: theme.primaryButtonBg },
        (disabled || loading) && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={theme.primaryButtonText} />
      ) : (
        <View style={styles.row}>
          {leading}
          <Text style={[styles.goldText, { color: theme.primaryButtonText }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  disabled,
  membershipTier,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  membershipTier?: MembershipTier | null;
}) {
  const theme = membershipTheme(membershipTier);
  return (
    <Pressable
      style={[
        styles.ghost,
        { borderColor: theme.ghostBorder },
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.ghostText, { color: theme.ghostText }]}>{label}</Text>
    </Pressable>
  );
}

export function Hairline() {
  return <View style={styles.hair} />;
}

export function QrGlyph({ color }: { color?: string }) {
  const fill = color ?? colors.ctaText;
  return (
    <View style={styles.qr}>
      <View style={[styles.qrDot, { backgroundColor: fill }]} />
      <View style={[styles.qrDot, { backgroundColor: fill }]} />
      <View style={[styles.qrDot, { backgroundColor: fill }]} />
      <View style={[styles.qrDot, { backgroundColor: fill, opacity: 0.45 }]} />
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

function markVariant(
  sheetOrHero: "mark" | "sheetMark",
  tier: MembershipTier | null | undefined
): "white" | "gold" | "circle" {
  const theme = membershipTheme(tier);
  const kind = theme[sheetOrHero];
  if (kind === "circle") return "circle";
  if (kind === "wing-gold") return "gold";
  return "white";
}

export function tierMarkVariant(
  tier: MembershipTier | null | undefined,
  which: "hero" | "sheet" = "hero"
): "white" | "gold" | "circle" {
  return markVariant(which === "sheet" ? "sheetMark" : "mark", tier);
}
