import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { deleteAccount, LEGAL_URLS } from "../../src/api";
import { useAuth } from "../../src/auth";
import { BrandMark } from "../../src/BrandMark";
import { GhostButton } from "../../src/chrome";
import { Screen } from "../../src/Screen";
import { colors, fonts } from "../../src/theme";

export default function AccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  function confirmDelete() {
    Alert.alert(
      "Delete account?",
      "This removes your check-in app account and sign-in session on this device. Your cafe loyalty contact in GoHighLevel is not deleted automatically.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void onDelete(),
        },
      ]
    );
  }

  async function onDelete() {
    setBusy(true);
    try {
      await deleteAccount();
      await signOut();
      router.replace("/(auth)/welcome");
    } catch (err) {
      Alert.alert(
        "Could not delete",
        err instanceof Error ? err.message : "Try again or email support."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen contentStyle={styles.safe}>
      <View style={styles.body}>
        <BrandMark size={88} />
        <Text style={styles.title}>Account</Text>
        <Text style={styles.copy}>
          Manage your check-in app session, privacy links, and account deletion.
        </Text>

        <Pressable
          style={styles.linkRow}
          onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
        >
          <Text style={styles.linkText}>Privacy Policy</Text>
        </Pressable>
        <Pressable
          style={styles.linkRow}
          onPress={() => void Linking.openURL(LEGAL_URLS.support)}
        >
          <Text style={styles.linkText}>Support</Text>
        </Pressable>
        <Pressable
          style={styles.linkRow}
          onPress={() => void Linking.openURL(LEGAL_URLS.deleteAccount)}
        >
          <Text style={styles.linkText}>Delete account (web)</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        {busy ? (
          <ActivityIndicator color={colors.accentBright} />
        ) : (
          <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
            <Text style={styles.deleteText}>Delete account</Text>
          </Pressable>
        )}
        <GhostButton label="Back" onPress={() => router.back()} disabled={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: {
    paddingBottom: 24,
    justifyContent: "space-between",
  },
  body: {
    paddingTop: 12,
    alignItems: "center",
    gap: 10,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.sansSemi,
    fontSize: 24,
    marginTop: 16,
  },
  copy: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  linkRow: {
    alignSelf: "stretch",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  linkText: {
    color: colors.accentBright,
    fontFamily: fonts.sansSemi,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textAlign: "center",
  },
  actions: { gap: 10 },
  deleteBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.bad,
  },
  deleteText: {
    color: colors.bad,
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});
