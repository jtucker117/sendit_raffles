import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Image, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { pickAndUploadImage } from "@/lib/upload";
import { colors, radius } from "@/lib/theme";

const TERMS = ["Donation", "Purchase", "Entry"] as const;

export default function CreateRaffleScreen() {
  const { user, isHostApproved } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [prize, setPrize] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("100");
  const [freeLimit, setFreeLimit] = useState("0");
  const [term, setTerm] = useState<(typeof TERMS)[number]>("Donation");
  const [amount, setAmount] = useState("10");
  const [goal, setGoal] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  // Revenue goal → per-seat price: goal ÷ total seats. Auto-fills the amount
  // whenever the goal or seat count changes (still manually editable after).
  useEffect(() => {
    const cap = parseInt(capacity, 10);
    const g = parseFloat(goal);
    if (cap > 0 && g > 0) setAmount((g / cap).toFixed(2));
  }, [goal, capacity]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isHostApproved) {
    return (
      <View style={styles.center}>
        <Text style={styles.gate}>Only approved hosts can create raffles.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </View>
    );
  }

  async function addCover() {
    try {
      setUploading(true);
      const url = await pickAndUploadImage("covers", user!.id, [16, 9]);
      if (url) setCoverUrl(url);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function create() {
    const cap = Math.max(2, Math.min(1000, parseInt(capacity, 10) || 0));
    const free = Math.max(0, Math.min(cap, parseInt(freeLimit, 10) || 0));
    if (!title.trim()) { Alert.alert("Add a title"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("raffles").insert({
        host_id: user!.id,
        title: title.trim(),
        prize: prize.trim() || null,
        description: description.trim() || null,
        cover_url: coverUrl,
        capacity: cap,
        free_seat_limit: free,
        entry_word: term.toLowerCase(),
        amount_cents: Math.round((parseFloat(amount) || 0) * 100),
        status: "open",
      });
      if (error) throw error;
      Alert.alert("Raffle created", `"${title.trim()}" is live.`, [
        { text: "OK", onPress: () => router.replace("/profile") },
      ]);
    } catch (e: any) {
      Alert.alert("Couldn't create raffle", e?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={styles.h1}>🎡 Create Raffle</Text>

      {/* Cover */}
      <TouchableOpacity style={styles.coverPick} onPress={addCover} disabled={uploading}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.coverImg} />
        ) : (
          <Text style={styles.coverText}>{uploading ? "Uploading…" : "📷 Add cover photo (optional)"}</Text>
        )}
      </TouchableOpacity>

      <Field label="Title">
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Spring Gun Raffle" placeholderTextColor={colors.faint} />
      </Field>
      <Field label="Prize">
        <TextInput style={styles.input} value={prize} onChangeText={setPrize} placeholder="e.g. Glock 19 / $500 Cash" placeholderTextColor={colors.faint} />
      </Field>
      <Field label="Description">
        <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="Details players should know…" placeholderTextColor={colors.faint} multiline />
      </Field>

      <View style={styles.row2}>
        <Field label="Total seats (max 1000)" style={{ flex: 1 }}>
          <TextInput style={styles.input} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" />
        </Field>
        <Field label="Free seats (max)" style={{ flex: 1 }}>
          <TextInput style={styles.input} value={freeLimit} onChangeText={setFreeLimit} keyboardType="number-pad" />
        </Field>
      </View>

      <Field label="Entry word">
        <View style={styles.segment}>
          {TERMS.map((t) => (
            <TouchableOpacity key={t} style={[styles.segItem, term === t && styles.segItemActive]} onPress={() => setTerm(t)}>
              <Text style={[styles.segText, term === t && styles.segTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>

      <Field label="Revenue goal for this raffle ($, optional)">
        <TextInput style={styles.input} value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder="e.g. 1000" placeholderTextColor={colors.faint} />
      </Field>

      <Field label={`Amount per ${term.toLowerCase()} ($)`}>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="10" placeholderTextColor={colors.faint} />
        <Text style={styles.helper}>
          {goal.trim()
            ? `Goal $${goal} ÷ ${parseInt(capacity, 10) || 0} seats = $${amount}/seat`
            : `Full board ≈ $${(((parseFloat(amount) || 0) * (parseInt(capacity, 10) || 0))).toFixed(0)} at ${parseInt(capacity, 10) || 0} seats`}
        </Text>
      </Field>

      <TouchableOpacity style={[styles.button, saving && { opacity: 0.6 }]} onPress={create} disabled={saving}>
        {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.buttonText}>Create raffle</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={[{ marginBottom: 16 }, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12, padding: 24 },
  gate: { color: colors.text, fontSize: 15, textAlign: "center" },
  h1: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 16, letterSpacing: -0.3 },
  coverPick: { height: 140, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 18 },
  coverImg: { width: "100%", height: "100%" },
  coverText: { color: colors.muted, fontSize: 14 },
  label: { color: colors.muted, fontSize: 12.5, fontWeight: "600", marginBottom: 8 },
  input: { backgroundColor: colors.surfaceAlt, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, color: colors.text, fontSize: 15 },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  helper: { color: colors.faint, fontSize: 12, marginTop: 6 },
  row2: { flexDirection: "row", gap: 12 },
  segment: { flexDirection: "row", gap: 8 },
  segItem: { flex: 1, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.inputBorder, alignItems: "center", backgroundColor: colors.surfaceAlt },
  segItemActive: { backgroundColor: colors.red, borderColor: colors.red },
  segText: { color: colors.text, fontWeight: "600", fontSize: 14 },
  segTextActive: { color: colors.onAccent },
  button: { backgroundColor: colors.red, paddingVertical: 15, borderRadius: radius.md, alignItems: "center", marginTop: 8 },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  backBtn: { alignSelf: "center", marginTop: 22, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
