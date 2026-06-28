import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Image, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { pickAndUploadImage } from "@/lib/upload";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

const TERMS = ["Donation", "Purchase", "Entry"] as const;

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: colors.muted, fontSize: 12.5, fontWeight: "600", marginBottom: 8 }}>
        {label}{required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

export default function CreateMini() {
  const { id } = useLocalSearchParams<{ id: string }>(); // parent game id
  const { user, isHostApproved } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [parent, setParent] = useState<{ id: string; title: string; category: string | null; host_id: string; amount_cents: number | null; capacity: number | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [capacity, setCapacity] = useState("");
  const [freeLimit, setFreeLimit] = useState("");
  const [seatsAwarded, setSeatsAwarded] = useState("1");
  const [term, setTerm] = useState<(typeof TERMS)[number]>("Donation");
  const [drawMode, setDrawMode] = useState<"single" | "elimination">("single");
  const [drawStyle, setDrawStyle] = useState<"wheel" | "scratch" | "lotto">("wheel");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("raffles").select("id, title, category, host_id, amount_cents, capacity").eq("id", id).single();
    if (data) { setParent(data as any); setTitle(`Mini — win seats in ${(data as any).title}`); }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  if (!parent || !isHostApproved || parent.host_id !== user?.id) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>You can only add a mini to your own game.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </View>
    );
  }

  // Auto-price: the mini's paid seats recover the value of the parent seats
  // being pulled. Host can't mark it up. Always rounds up so seats aren't undersold.
  const parentPriceCents = parent.amount_cents ?? 0;
  const seatsNum = Math.max(1, parseInt(seatsAwarded, 10) || 1);
  const capNum = Math.max(0, parseInt(capacity, 10) || 0);
  const freeNum = Math.max(0, Math.min(capNum, parseInt(freeLimit, 10) || 0));
  const paidSeats = Math.max(0, capNum - freeNum);
  const totalValueCents = seatsNum * parentPriceCents;
  const perSeatCents = paidSeats > 0 ? Math.ceil(totalValueCents / paidSeats) : 0;
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;

  async function addCover() {
    try { setUploading(true); const url = await pickAndUploadImage("covers", user!.id, [16, 9]); if (url) setCoverUrl(url); }
    catch (e: any) { Alert.alert("Upload failed", e?.message ?? "Try again."); } finally { setUploading(false); }
  }

  async function create() {
    const cap = Math.max(2, Math.min(1000, parseInt(capacity, 10) || 0));
    const free = Math.max(0, Math.min(cap, parseInt(freeLimit, 10) || 0));
    const seats = Math.max(1, parseInt(seatsAwarded, 10) || 1);
    const paid = Math.max(0, cap - free);
    const perCents = paid > 0 ? Math.ceil((seats * parentPriceCents) / paid) : 0;
    if (!title.trim()) { Alert.alert("Title required"); return; }
    if (!(parseInt(capacity, 10) >= 2)) { Alert.alert("Seats required", "Enter total seats (at least 2)."); return; }
    if (parent!.capacity != null && seats > parent!.capacity) {
      Alert.alert("Too many seats", `The main game only has ${parent!.capacity} seats — you can't award more than that.`); return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("raffles").insert({
        host_id: user!.id,
        title: title.trim(),
        prize: `${seats} seat${seats === 1 ? "" : "s"} in ${parent!.title}`,
        category: parent!.category,
        cover_url: coverUrl,
        capacity: cap,
        free_seat_limit: free,
        entry_word: term.toLowerCase(),
        amount_cents: perCents,
        draw_style: drawStyle,
        draw_mode: drawMode,
        parent_raffle_id: parent!.id,
        seats_awarded: seats,
        status: "open",
      });
      if (error) throw error;
      router.replace(`/raffle/${parent!.id}`);
    } catch (e: any) {
      Alert.alert("Couldn't create mini", e?.message ?? "Try again.");
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 40 }}>
      <Text style={styles.h1}>Create a mini</Text>
      <View style={styles.parentBanner}>
        <Text style={styles.parentText}>Winner gets seats in <Text style={{ fontWeight: "900" }}>{parent.title}</Text>. The won seats are added to that game automatically.</Text>
      </View>

      <Field label="Cover photo">
        <TouchableOpacity style={styles.coverPick} onPress={addCover} disabled={uploading}>
          {coverUrl ? <Image source={{ uri: coverUrl }} style={styles.coverImg} /> : <Text style={styles.coverText}>{uploading ? "Uploading…" : "📷 Add cover (optional)"}</Text>}
        </TouchableOpacity>
      </Field>

      <Field label="Title" required><TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor={colors.faint} /></Field>

      <Field label="Seats the winner wins in the main game" required>
        <TextInput style={styles.input} value={seatsAwarded} onChangeText={setSeatsAwarded} keyboardType="number-pad" placeholder="1" placeholderTextColor={colors.faint} />
      </Field>

      <View style={styles.row2}>
        <View style={{ flex: 1 }}><Field label="Mini seats" required><TextInput style={styles.input} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" placeholder="e.g. 50" placeholderTextColor={colors.faint} /></Field></View>
        <View style={{ flex: 1 }}><Field label="Free seats"><TextInput style={styles.input} value={freeLimit} onChangeText={setFreeLimit} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.faint} /></Field></View>
      </View>
      <Field label={`Price per ${term.toLowerCase()} — auto-set`}>
        <View style={styles.priceCard}>
          <View style={styles.priceTop}>
            <Text style={styles.priceBig}>{money(perSeatCents)}</Text>
            <View style={styles.lockPill}><Text style={styles.lockText}>🔒 Locked</Text></View>
          </View>
          <Text style={styles.priceSub}>
            {parentPriceCents === 0
              ? "The main game's seats are free, so this mini is free too."
              : paidSeats === 0
                ? "All mini seats are free — nothing to charge."
                : `${seatsNum} seat${seatsNum === 1 ? "" : "s"} × ${money(parentPriceCents)} = ${money(totalValueCents)} of value, split across ${paidSeats} paid seat${paidSeats === 1 ? "" : "s"} (rounded up). The price matches what the seats actually cost — minis can't be marked up.`}
          </Text>
        </View>
      </Field>

      <Field label="Entry word">
        <View style={styles.seg}>
          {TERMS.map((t) => (
            <TouchableOpacity key={t} style={[styles.segItem, term === t && styles.segOn]} onPress={() => setTerm(t)}>
              <Text style={[styles.segText, term === t && styles.segTextOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>

      <Field label="Draw mode">
        <View style={styles.seg}>
          {([["single", "Single pick"], ["elimination", "Last man standing"]] as const).map(([k, label]) => (
            <TouchableOpacity key={k} style={[styles.segItem, drawMode === k && styles.segOn]} onPress={() => setDrawMode(k)}>
              <Text style={[styles.segText, drawMode === k && styles.segTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>
      {drawMode === "single" && (
        <Field label="Reveal style">
          <View style={styles.seg}>
            {([["wheel", "Wheel"], ["scratch", "Scratch"], ["lotto", "Lotto"]] as const).map(([k, label]) => (
              <TouchableOpacity key={k} style={[styles.segItem, drawStyle === k && styles.segOn]} onPress={() => setDrawStyle(k)}>
                <Text style={[styles.segText, drawStyle === k && styles.segTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>
      )}

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} disabled={saving} onPress={create}>
        {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.saveText}>Create mini</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12, padding: 24 },
  muted: { color: colors.muted, textAlign: "center" },
  h1: { color: colors.text, fontSize: 24, fontWeight: "900", marginBottom: 12 },
  parentBanner: { backgroundColor: colors.redSoft, borderColor: colors.red, borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 16 },
  parentText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  coverPick: { height: 130, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverImg: { width: "100%", height: "100%" },
  coverText: { color: colors.muted, fontSize: 14 },
  input: { backgroundColor: colors.surfaceAlt, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, color: colors.text, fontSize: 15 },
  priceCard: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 14 },
  priceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  priceBig: { color: colors.text, fontSize: 26, fontWeight: "900" },
  lockPill: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 4 },
  lockText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  priceSub: { color: colors.muted, fontSize: 12.5, lineHeight: 18 },
  row2: { flexDirection: "row", gap: 12 },
  seg: { flexDirection: "row", gap: 8 },
  segItem: { flex: 1, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.inputBorder, alignItems: "center", backgroundColor: colors.surfaceAlt },
  segOn: { backgroundColor: colors.red, borderColor: colors.red },
  segText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  segTextOn: { color: colors.onAccent },
  saveBtn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 15, alignItems: "center", marginTop: 8 },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: "800" },
  backBtn: { alignSelf: "center", marginTop: 18, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
