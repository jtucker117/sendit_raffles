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

  const [parent, setParent] = useState<{ id: string; title: string; category: string | null; host_id: string; amount_cents: number | null; capacity: number | null; cover_url: string | null; free_seat_limit: number | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [capacity, setCapacity] = useState("");
  const [freeLimit, setFreeLimit] = useState("");
  const [seatsAwarded, setSeatsAwarded] = useState("1");
  const [term, setTerm] = useState<(typeof TERMS)[number]>("Donation");
  const [drawMode, setDrawMode] = useState<"single" | "elimination">("single");
  const [drawStyle, setDrawStyle] = useState<"wheel" | "scratch" | "lotto">("wheel");
  const [saving, setSaving] = useState(false);
  const [takenSeats, setTakenSeats] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("raffles").select("id, title, category, host_id, amount_cents, capacity, cover_url, free_seat_limit").eq("id", id).single();
    if (data) {
      setParent(data as any);
      // How many PAID parent seats are already taken (claimed paid + reserved) — minis can only pull from the paid pool.
      const { count } = await supabase.from("tickets").select("seat_number", { count: "exact", head: true }).eq("raffle_id", id).eq("type", "paid");
      setTakenSeats(count ?? 0);
      // Auto-number: next number is one past the highest existing "Mini N" for this parent.
      const { data: minis } = await supabase.from("raffles").select("title").eq("parent_raffle_id", id);
      let maxN = 0;
      (minis ?? []).forEach((r: any) => { const m = /^Mini (\d+)\b/.exec(r.title || ""); if (m) maxN = Math.max(maxN, parseInt(m[1], 10)); });
      const n = Math.max(maxN, minis?.length ?? 0) + 1;
      setTitle(`Mini ${n} for ${(data as any).title}`);
    }
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

  // Auto-price: spread the value of the awarded parent seats evenly across the
  // mini seats. (awarded seats × parent price) ÷ mini seats. No round-up; host
  // can't change it, so minis can't be marked up.
  const parentPriceCents = parent.amount_cents ?? 0;
  const seatsNum = Math.max(1, parseInt(seatsAwarded, 10) || 1);
  const capNum = Math.max(0, parseInt(capacity, 10) || 0);
  const totalValueCents = seatsNum * parentPriceCents;
  const perSeatCents = capNum > 0 ? Math.round(totalValueCents / capNum) : 0;
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  // Minis only pull from the paid pool: (capacity − free seats) − paid already taken.
  const maxAward = Math.max(0, (parent.capacity ?? 0) - (parent.free_seat_limit ?? 0) - takenSeats);
  const overAward = seatsNum > maxAward;

  async function create() {
    const cap = Math.max(2, Math.min(1000, parseInt(capacity, 10) || 0));
    const free = Math.max(0, Math.min(cap, parseInt(freeLimit, 10) || 0));
    const seats = Math.max(1, parseInt(seatsAwarded, 10) || 1);
    const perCents = cap > 0 ? Math.round((seats * parentPriceCents) / cap) : 0;
    if (!title.trim()) { Alert.alert("Title required"); return; }
    if (!(parseInt(capacity, 10) >= 2)) { Alert.alert("Seats required", "Enter total seats (at least 2)."); return; }
    if (seats > maxAward) {
      Alert.alert("Too many seats", `Only ${maxAward} seat${maxAward === 1 ? "" : "s"} ${maxAward === 1 ? "is" : "are"} still available in ${parent!.title}.`); return;
    }
    setSaving(true);
    try {
      const { data: created, error } = await supabase.from("raffles").insert({
        host_id: user!.id,
        title: title.trim(),
        prize: `${seats} seat${seats === 1 ? "" : "s"} in ${parent!.title}`,
        category: parent!.category,
        cover_url: coverUrl ?? parent!.cover_url, // default to the parent game's image
        capacity: cap,
        free_seat_limit: free,
        entry_word: term.toLowerCase(),
        amount_cents: perCents,
        draw_style: drawStyle,
        draw_mode: drawMode,
        parent_raffle_id: parent!.id,
        seats_awarded: seats,
        status: "open",
      }).select("id").single();
      if (error) throw error;
      // Lock the awarded seats in the parent so nobody else can claim them.
      if (created?.id && seats > 0) {
        const { data: reserved, error: rErr } = await supabase.rpc("reserve_mini_seats", { p_parent: parent!.id, p_mini: created.id, p_count: seats });
        if (rErr) { Alert.alert("Heads up", `Mini created, but seats couldn't be reserved: ${rErr.message}. Run SUPABASE_MINI_RESERVE.md.`); }
        else if ((reserved ?? 0) < seats) { Alert.alert("Heads up", `Only ${reserved ?? 0} of ${seats} seats could be reserved (the rest were already taken).`); }
      }
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
        <CoverPicker bucket="covers" userId={user!.id} value={coverUrl} onChange={setCoverUrl} aspect={[16, 9]} height={130} />
      </Field>

      <Field label="Title — auto-numbered">
        <View style={styles.readonlyField}>
          <Text style={styles.readonlyText}>{title}</Text>
          <View style={styles.lockPill}><Text style={styles.lockText}>🔒 Auto</Text></View>
        </View>
      </Field>

      <Field label="Seats the winner wins in the main game" required>
        <TextInput style={[styles.input, overAward && styles.inputError]} value={seatsAwarded} onChangeText={setSeatsAwarded} keyboardType="number-pad" placeholder="1" placeholderTextColor={colors.faint} />
        <Text style={[styles.hint, overAward && styles.hintError]}>
          {overAward
            ? `Only ${maxAward} paid seat${maxAward === 1 ? "" : "s"} available in ${parent.title} (free seats can't be pulled).`
            : `${maxAward} paid seat${maxAward === 1 ? "" : "s"} available to give away.`}
        </Text>
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
              : capNum < 2
                ? "Enter the number of mini seats to set the price."
                : `${seatsNum} main seat${seatsNum === 1 ? "" : "s"} (${money(totalValueCents)}) ÷ ${capNum} mini seats = ${money(perSeatCents)} each. Locked — minis can't be marked up.`}
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

      <TouchableOpacity style={[styles.saveBtn, (saving || overAward || maxAward < 1) && { opacity: 0.5 }]} disabled={saving || overAward || maxAward < 1} onPress={create}>
        {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.saveText}>{maxAward < 1 ? "No paid seats available" : "Create mini"}</Text>}
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
  inputError: { borderColor: colors.danger },
  hint: { color: colors.muted, fontSize: 12, marginTop: 6 },
  hintError: { color: colors.danger, fontWeight: "700" },
  readonlyField: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  readonlyText: { color: colors.text, fontSize: 15, fontWeight: "700", flexShrink: 1 },
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
