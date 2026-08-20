import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { startAuth } from "../../src/api";
import { useAuth } from "../../src/auth";
import { BrandMark } from "../../src/BrandMark";
import { GoldButton } from "../../src/chrome";
import { Screen } from "../../src/Screen";
import { colors, fonts, radii } from "../../src/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { setMember } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const result = await startAuth(name.trim(), phone.trim());
      if (result.skippedOtp) {
        setMember(result.member);
        router.replace("/(app)/home");
        return;
      }
      router.push({
        pathname: "/(auth)/verify",
        params: { phone: result.phone, name: name.trim() },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen contentStyle={styles.safe}>
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View>
          <BrandMark size={88} />
          <Text style={styles.title}>Let’s get you set up.</Text>
          <Text style={styles.sub}>Enter your name and phone to get started.</Text>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="Your name"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="(555) 123-4567"
            placeholderTextColor={colors.muted}
            autoComplete="tel"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        <GoldButton
          label="Continue"
          onPress={onSubmit}
          loading={busy}
          disabled={!name.trim() || !phone.trim()}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { paddingBottom: 28 },
  wrap: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 8,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.sansSemi,
    fontSize: 26,
    textAlign: "center",
    marginTop: 28,
  },
  sub: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 15,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 28,
  },
  label: {
    color: colors.accentBright,
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    backgroundColor: colors.input,
    borderRadius: radii.sm,
    color: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    fontFamily: fonts.sans,
  },
  error: {
    color: colors.bad,
    marginTop: 12,
    fontFamily: fonts.sansMedium,
    textAlign: "center",
  },
});
