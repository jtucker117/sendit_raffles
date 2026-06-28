import { useState, useMemo } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";

export default function Join() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function redeem() {
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("join_host_by_code", { p_code: c });
      if (error) throw error;
      // Web ignores Alert button callbacks — go straight home where the host's games now appear.
      router.replace("/");
    } catch (e: any) {
      Alert.alert("Couldn't follow", e?.message ?? "Check the code and try again.");
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Follow a host</Text>
      <Text style={styles.sub}>
        Enter a host's code to follow them. You'll see their games and join their group chat.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Enter code (e.g. 4F9A2C)"
        placeholderTextColor={colors.faint}
        autoCapitalize="characters"
        autoCorrect={false}
        value={code}
        onChangeText={setCode}
      />

      <TouchableOpacity style={[styles.button, busy && { opacity: 0.6 }]} onPress={redeem} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.buttonText}>Follow host</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 64 },
  h1: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  sub: { color: colors.muted, fontSize: 14, marginTop: 8, marginBottom: 24, lineHeight: 20 },
  input: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 14, color: colors.text, fontSize: 18, letterSpacing: 2, textAlign: "center", fontWeight: "700" },
  button: { backgroundColor: colors.red, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginTop: 16 },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  backBtn: { alignSelf: "center", marginTop: 24, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
