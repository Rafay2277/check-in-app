import { MembershipTier } from "./api";
import { colors } from "./theme";

export type MembershipTheme = {
  tier: MembershipTier;
  /** Full-screen hero / screen background gradient */
  screenGradient: [string, string, string];
  /** Primary CTA fill (YES / Check in) */
  primaryButtonBg: string;
  primaryButtonText: string;
  /** Secondary outline button */
  ghostBorder: string;
  ghostText: string;
  /** Brand mark style */
  mark: "circle" | "wing";
  sheetMark: "circle" | "wing" | "wing-gold";
};

const standard: MembershipTheme = {
  tier: "standard",
  screenGradient: ["#161616", colors.bg0, "#0c0c0c"],
  primaryButtonBg: colors.accent,
  primaryButtonText: colors.ctaText,
  ghostBorder: "rgba(238, 227, 207, 0.28)",
  ghostText: colors.ink,
  mark: "circle",
  sheetMark: "wing-gold",
};

const premium: MembershipTheme = {
  tier: "premium",
  screenGradient: ["#8a855f", "#7b775a", "#6c694f"],
  primaryButtonBg: "#ffffff",
  primaryButtonText: "#111111",
  ghostBorder: "rgba(255, 255, 255, 0.55)",
  ghostText: "#ffffff",
  mark: "wing",
  sheetMark: "wing",
};

export function membershipTheme(
  tier: MembershipTier | null | undefined
): MembershipTheme {
  return tier === "premium" ? premium : standard;
}
