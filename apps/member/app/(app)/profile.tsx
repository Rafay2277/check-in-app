import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  fetchProfile,
  updateProfile,
  type MemberProfile,
} from "../../src/api";
import { useAuth } from "../../src/auth";
import { GhostButton, GoldButton, Hairline } from "../../src/chrome";
import { Screen } from "../../src/Screen";
import { colors, fonts, radii } from "../../src/theme";

const emptyProfile: MemberProfile = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  vehicleMake: "",
  vehicleYear: "",
  vehicleModel: "",
};

export default function ProfileScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [form, setForm] = useState<MemberProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const profile = await fetchProfile();
          if (active) setForm(profile);
        } catch (err) {
          if (active) {
            setError(err instanceof Error ? err.message : "Failed to load");
          }
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  function setField<K extends keyof MemberProfile>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      const saved = await updateProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        vehicleMake: form.vehicleMake.trim(),
        vehicleYear: form.vehicleYear.trim(),
        vehicleModel: form.vehicleModel.trim(),
      });
      setForm(saved);
      try {
        await refreshProfile();
      } catch {
        // Local session refresh is best-effort; GHL save already succeeded.
      }
      Alert.alert("Saved", "Your profile was updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    form.firstName.trim().length > 0 && form.phone.trim().length >= 7;

  return (
    <Screen contentStyle={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Profile</Text>

          {loading ? (
            <ActivityIndicator
              color={colors.accentBright}
              style={{ marginTop: 40 }}
            />
          ) : (
            <View style={styles.form}>
              <Text style={styles.section}>Contact</Text>
              <View style={styles.row}>
                <Field
                  style={styles.half}
                  label="First name"
                  value={form.firstName}
                  onChangeText={(v) => setField("firstName", v)}
                  autoCapitalize="words"
                />
                <Field
                  style={styles.half}
                  label="Last name"
                  value={form.lastName}
                  onChangeText={(v) => setField("lastName", v)}
                  autoCapitalize="words"
                />
              </View>
              <Field
                label="Phone"
                value={form.phone}
                onChangeText={(v) => setField("phone", v)}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <Field
                label="Email"
                value={form.email}
                onChangeText={(v) => setField("email", v)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />

              <Hairline />

              <Text style={styles.section}>Vehicle</Text>
              <View style={styles.row}>
                <Field
                  style={styles.year}
                  label="Year"
                  value={form.vehicleYear}
                  onChangeText={(v) => setField("vehicleYear", v)}
                  keyboardType="number-pad"
                />
                <Field
                  style={styles.flexGrow}
                  label="Make"
                  value={form.vehicleMake}
                  onChangeText={(v) => setField("vehicleMake", v)}
                  autoCapitalize="words"
                />
              </View>
              <Field
                label="Model"
                value={form.vehicleModel}
                onChangeText={(v) => setField("vehicleModel", v)}
                autoCapitalize="words"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          )}
        </ScrollView>

        <View style={styles.actions}>
          <GoldButton
            label="Save"
            onPress={() => void onSave()}
            loading={saving}
            disabled={loading || !canSave}
          />
          <GhostButton
            label="Back"
            onPress={() => router.back()}
            disabled={saving}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  autoComplete,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "phone-pad" | "email-address" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoComplete?: "tel" | "email" | "off";
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { paddingBottom: 18 },
  flex: { flex: 1 },
  scroll: {
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.sansSemi,
    fontSize: 24,
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 20,
  },
  form: {
    gap: 14,
  },
  section: {
    color: colors.muted,
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    marginBottom: -2,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  half: {
    flex: 1,
  },
  year: {
    width: 88,
  },
  flexGrow: {
    flex: 1,
  },
  field: {},
  label: {
    color: colors.accentBright,
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  input: {
    backgroundColor: colors.input,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: fonts.sans,
  },
  error: {
    color: colors.bad,
    marginTop: 4,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    textAlign: "center",
  },
  actions: { gap: 8 },
});
