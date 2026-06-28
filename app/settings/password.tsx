import { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

export default function ChangePassword() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (pw.length < 8) { Alert.alert("Too short", "Password must be at least 8 characters."); return; }
    if (pw !== confirm) { Alert.alert("Doesn't match", "The two passwords don't match."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      Alert.alert("Password changed", "Your password has been updated.");
      router.back();
    } catch (e: any) {
      Alert.alert("Couldn't change password", e?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 40 }}>
      <Text style={styles.h1}>Change password</Text>
      <Text style={styles.sub}>Pick a new password for your account.</Text>

      <Text style={styles.label}>New password</Text>
      <TextInput style={styles.input} value={pw} onChangeText={setPw} secureTextEntry placeholder="At least 8 characters" placeholderTextColor={colors.faint} />

      <Text style={styles.label}>Confirm new password</Text>
      <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Re-enter password" placeholderTextColor={colors.faint} />

      <TouchableOpacity style={[styles.btn, saving && { opacity: 0.5 }]} disabled={saving} onPress={save}>
        {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.btnText}>Update password</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}><Text style={styles.backText}>← Back</Text></TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 24, fontWeight: "900" },
  sub: { color: colors.muted, fontSize: 14, marginTop: 6, marginBottom: 18 },
  label: { color: colors.muted, fontSize: 12.5, fontWeight: "600", marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: colors.surfaceAlt, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, color: colors.text, fontSize: 15 },
  btn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 15, alignItems: "center", marginTop: 22 },
  btnText: { color: colors.onAccent, fontSize: 16, fontWeight: "800" },
  back: { alignSelf: "center", marginTop: 18, padding: 10 },
  backText: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
