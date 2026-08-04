import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { startAuth } from "../../src/api";
import { useAuth } from "../../src/auth";
import { Screen } from "../../src/Screen";
import { colors, fonts } from "../../src/theme";

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
    <Screen edges={["bottom"]} contentStyle={styles.safe}>
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.form}>
          <Text style={styles.label}>Name</Text>
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
          <Text style={styles.hint}>
            Use the phone number on your fourtillfour loyalty account. US numbers
            default to +1.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        <Pressable
          style={[
            styles.cta,
            (!name.trim() || !phone.trim() || busy) && styles.ctaDisabled,
          ]}
          disabled={!name.trim() || !phone.trim() || busy}
          onPress={onSubmit}
        >
          {busy ? (
            <ActivityIndicator color={colors.ctaText} />
          ) : (
            <Text style={styles.ctaText}>Continue</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { paddingBottom: 24 },
  wrap: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 8,
  },
  form: { gap: 10 },
  label: {
    color: colors.accentBright,
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 2,
    color: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: fonts.sans,
  },
  hint: {
    color: colors.muted,
    fontFamily: fonts.serif,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.bad,
    marginTop: 8,
    fontFamily: fonts.sansMedium,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 2,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: {
    color: colors.ctaText,
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
});
