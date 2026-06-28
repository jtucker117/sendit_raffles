import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Image, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { CoverPicker } from "@/components/CoverPicker";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

const CATEGORIES = ["PEWS", "Cash", "Optics", "Gear", "Charity"] as const;

function Field({ label, children, locked }: { label: string; children: React.ReactNode; locked?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: colors.muted, fontSize: 12.5, fontWeight: "600", marginBottom: 8 }}>
        {label}{locked ? <Text style={{ color: colors.faint }}>  🔒 locked</Text> : null}
      </Text>
      {children}
    </View>
  );
}

export default function EditGame() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isSuperadmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [claimed, setClaimed] = useState(0);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [prize, setPrize] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [capacity, setCapacity] = useState("");
  const [freeLimit, setFreeLimit] = useState("");
  const [amount, setAmount] = useState("");
  const [drawMode, setDrawMode] = useState<"single" | "elimination">("single");
  const [drawStyle, setDrawStyle] = useState<"wheel" | "scratch" | "lotto">("wheel");
  const [showOdds, setShowOdds] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: r } = await supabase.from("raffles").select("*").eq("id", id).single();
    if (r) {
      setAllowed(r.host_id === user?.id || isSuperadmin);
      setTitle(r.title ?? ""); setPrize(r.prize ?? ""); setCategory(r.category ?? "");
      setDescription(r.description ?? ""); setCoverUrl(r.cover_url ?? null);
      setCapacity(String(r.capacity ?? "")); setFreeLimit(String(r.free_seat_limit ?? ""));
      setAmount(String((r.amount_cents ?? 0) / 100));
      setDrawMode(r.draw_mode === "elimination" ? "elimination" : "single");
      setDrawStyle(r.draw_style ?? "wheel");
      setShowOdds(r.show_odds ?? true);
      const { count } = await supabase.from("tickets").select("*", { count: "exact", head: true }).eq("raffle_id", id);
      setClaimed(count ?? 0);
    }
    setLoading(false);
  }, [id, user?.id, isSuperadmin]);

  useEffect(() => { load(); }, [load]);

  const locked = claimed > 0 && !isSuperadmin;


  async function save() {
    if (!title.trim()) { Alert.alert("Title required"); return; }
    if (!category) { Alert.alert("Pick a category"); return; }
    setSaving(true);
    const patch: any = {
      title: title.trim(), prize: prize.trim() || null, category, description: description.trim() || null, cover_url: coverUrl,
      show_odds: showOdds, // cosmetic — editable any time
    };
    if (!locked) {
      patch.capacity = Math.max(2, Math.min(1000, parseInt(capacity, 10) || 0));
      patch.free_seat_limit = Math.max(0, parseInt(freeLimit, 10) || 0); // free seats are extra, not capped by capacity
      patch.amount_cents = Math.round((parseFloat(amount) || 0) * 100);
      patch.draw_mode = drawMode;
      patch.draw_style = drawStyle;
    }
    const { error } = await supabase.from("raffles").update(patch).eq("id", id);
    setSaving(false);
    if (error) { Alert.alert("Couldn't save", error.message); return; }
    router.back();
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>You can't edit this game.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 40 }}>
      <Text style={styles.h1}>Edit game</Text>
      {locked && (
        <View style={styles.lockBanner}>
          <Text style={styles.lockText}>🔒 {claimed} player{claimed === 1 ? " has" : "s have"} entered — price, seats, and draw type are locked to keep it fair. You can still edit the title, prize, category, cover, and description.</Text>
        </View>
      )}

      <Field label="Cover photo">
        <CoverPicker bucket="covers" userId={user!.id} value={coverUrl} onChange={setCoverUrl} aspect={[16, 9]} />
      </Field>

      <Field label="Title"><TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor={colors.faint} /></Field>
      <Field label="Prize"><TextInput style={styles.input} value={prize} onChangeText={setPrize} placeholder="e.g. PEW / $500 Cash" placeholderTextColor={colors.faint} /></Field>
      <Field label="Category">
        <View style={styles.wrap}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipOn]} onPress={() => setCategory(c)}>
              <Text style={[styles.chipText, category === c && styles.chipTextOn]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>
      <Field label="Description"><TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} multiline placeholderTextColor={colors.faint} /></Field>

      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Field label="Total seats" locked={locked}><TextInput style={[styles.input, locked && styles.inputLocked]} value={capacity} onChangeText={setCapacity} editable={!locked} keyboardType="number-pad" /></Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Free seats" locked={locked}><TextInput style={[styles.input, locked && styles.inputLocked]} value={freeLimit} onChangeText={setFreeLimit} editable={!locked} keyboardType="number-pad" /></Field>
        </View>
      </View>
      <Field label="Price per seat ($)" locked={locked}><TextInput style={[styles.input, locked && styles.inputLocked]} value={amount} onChangeText={setAmount} editable={!locked} keyboardType="decimal-pad" /></Field>

      <Field label="Draw mode" locked={locked}>
        <View style={styles.seg}>
          {([["single", "Single pick"], ["elimination", "Last man standing"]] as const).map(([k, label]) => (
            <TouchableOpacity key={k} style={[styles.segItem, drawMode === k && styles.segOn, locked && styles.inputLocked]} disabled={locked} onPress={() => setDrawMode(k)}>
              <Text style={[styles.segText, drawMode === k && styles.segTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>
      {drawMode === "single" && (
        <Field label="Reveal style" locked={locked}>
          <View style={styles.seg}>
            {([["wheel", "Wheel"], ["scratch", "Scratch"], ["lotto", "Lotto"]] as const).map(([k, label]) => (
              <TouchableOpacity key={k} style={[styles.segItem, drawStyle === k && styles.segOn, locked && styles.inputLocked]} disabled={locked} onPress={() => setDrawStyle(k)}>
                <Text style={[styles.segText, drawStyle === k && styles.segTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>
      )}

      <Field label="Winning odds">
        <TouchableOpacity style={styles.oddsToggle} onPress={() => setShowOdds((v) => !v)}>
          <View style={[styles.oddsBox, showOdds && styles.oddsBoxOn]}>{showOdds ? <Text style={styles.oddsCheck}>✓</Text> : null}</View>
          <Text style={styles.oddsToggleText}>Show players their odds of winning</Text>
        </TouchableOpacity>
      </Field>

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} disabled={saving} onPress={save}>
        {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.saveText}>Save changes</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12, padding: 24 },
  muted: { color: colors.muted, textAlign: "center" },
  h1: { color: colors.text, fontSize: 24, fontWeight: "900", marginBottom: 14 },
  lockBanner: { backgroundColor: colors.amberSoft, borderColor: colors.amber, borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 16 },
  lockText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  coverPick: { height: 140, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverImg: { width: "100%", height: "100%" },
  coverText: { color: colors.muted, fontSize: 14 },
  input: { backgroundColor: colors.surfaceAlt, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, color: colors.text, fontSize: 15 },
  inputLocked: { opacity: 0.5 },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  row2: { flexDirection: "row", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.surfaceAlt },
  chipOn: { backgroundColor: colors.red, borderColor: colors.red },
  chipText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  chipTextOn: { color: colors.onAccent },
  seg: { flexDirection: "row", gap: 8 },
  segItem: { flex: 1, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.inputBorder, alignItems: "center", backgroundColor: colors.surfaceAlt },
  segOn: { backgroundColor: colors.red, borderColor: colors.red },
  segText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  segTextOn: { color: colors.onAccent },
  oddsToggle: { flexDirection: "row", alignItems: "center", gap: 10 },
  oddsBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  oddsBoxOn: { backgroundColor: colors.red, borderColor: colors.red },
  oddsCheck: { color: colors.onAccent, fontSize: 14, fontWeight: "900" },
  oddsToggleText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  saveBtn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 15, alignItems: "center", marginTop: 8 },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: "800" },
  backBtn: { alignSelf: "center", marginTop: 18, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
