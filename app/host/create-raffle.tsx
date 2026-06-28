import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Image, Alert, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { CoverPicker } from "@/components/CoverPicker";
import { GameCard } from "@/components/GameCard";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

// Date/time picker: native HTML input on web, text fallback on native.
function DateTimeField({ value, onChange, colors }: { value: string; onChange: (v: string) => void; colors: AppColors }) {
  if (Platform.OS === "web") {
    return React.createElement("input", {
      type: "datetime-local",
      value,
      onChange: (e: any) => onChange(e.target.value),
      style: { backgroundColor: colors.surfaceAlt, color: colors.text, border: `1px solid ${colors.inputBorder}`, borderRadius: 14, padding: 12, fontSize: 15, width: "100%", boxSizing: "border-box" },
    });
  }
  return <TextInput value={value} onChangeText={onChange} placeholder="2026-07-01T18:00" placeholderTextColor={colors.faint} style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, color: colors.text, fontSize: 15 }} />;
}

const TERMS = ["Donation", "Purchase", "Entry"] as const;
const CATEGORIES = ["PEWS", "Cash", "Optics", "Gear", "Charity"] as const;

export default function CreateRaffleScreen() {
  const { user, isHostApproved } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [prize, setPrize] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("");
  const [freeLimit, setFreeLimit] = useState("");
  const [term, setTerm] = useState<(typeof TERMS)[number]>("Donation");
  const [amount, setAmount] = useState("");
  const [goal, setGoal] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [drawStyle, setDrawStyle] = useState<"wheel" | "scratch" | "lotto">("wheel");
  const [drawMode, setDrawMode] = useState<"single" | "elimination">("single");
  const [scheduledAt, setScheduledAt] = useState(""); // datetime-local string; blank = launch now
  const [step, setStep] = useState(0); // 0 Prize · 1 Tickets · 2 Rules · 3 Publish

  // Revenue goal → per-seat price: goal ÷ PAID seats (free seats raise $0, so the
  // paid seats have to cover the whole goal), rounded UP to the next whole dollar
  // so the goal is always met. Auto-fills whenever the goal, seat count, or
  // free-seat count changes (still manually editable after).
  useEffect(() => {
    const cap = parseInt(capacity, 10) || 0; // paid seats
    const g = parseFloat(goal);
    if (cap > 0 && g > 0) setAmount(String(Math.ceil(g / cap)));
  }, [goal, capacity]);
  const [saving, setSaving] = useState(false);

  if (!isHostApproved) {
    return (
      <View style={styles.center}>
        <Text style={styles.gate}>Only approved hosts can create games.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </View>
    );
  }


  async function create(mode: "open" | "draft" | "scheduled") {
    const cap = Math.max(2, Math.min(1000, parseInt(capacity, 10) || 0)); // paid seats
    const free = Math.max(0, Math.min(1000, parseInt(freeLimit, 10) || 0)); // extra free seats on top
    if (!title.trim()) { Alert.alert("Title required", "Give your game a title."); return; }
    if (!(parseInt(capacity, 10) >= 2)) { Alert.alert("Paid seats required", "Enter the number of paid seats (at least 2)."); return; }
    if (!(parseFloat(amount) > 0)) {
      Alert.alert("Seat price required", "Set the amount per paid seat.");
      return;
    }
    let scheduledISO: string | null = null;
    if (mode === "scheduled") {
      const d = new Date(scheduledAt);
      if (!scheduledAt || isNaN(d.getTime()) || d.getTime() <= Date.now()) {
        Alert.alert("Pick a future time", "Choose a date and time in the future to schedule this game.");
        return;
      }
      scheduledISO = d.toISOString();
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("raffles").insert({
        host_id: user!.id,
        title: title.trim(),
        prize: prize.trim() || null,
        category: category || null,
        description: description.trim() || null,
        cover_url: coverUrl,
        capacity: cap,
        free_seat_limit: free,
        entry_word: term.toLowerCase(),
        amount_cents: Math.round((parseFloat(amount) || 0) * 100),
        draw_style: drawStyle,
        draw_mode: drawMode,
        status: mode,
        scheduled_at: scheduledISO,
      });
      if (error) throw error;
      // Drafts/scheduled go to the dashboard so the host sees them; live games to home.
      router.replace(mode === "open" ? "/" : "/host/dashboard");
    } catch (e: any) {
      Alert.alert("Couldn't save game", e?.message ?? "Try again.");
      setSaving(false);
    }
  }

  const cap = parseInt(capacity, 10) || 0;
  const free = parseInt(freeLimit, 10) || 0;
  const paid = cap; // free seats are added on top — all capacity is paid
  const raised = (parseFloat(amount) || 0) * paid;

  const STEPS = ["Prize", "Tickets", "Rules", "Publish"];
  function stepValid(s: number): boolean {
    if (s === 0) return !!title.trim() && !!category;
    if (s === 1) return cap >= 2 && (paid <= 0 || parseFloat(amount) > 0);
    return true; // Rules + Publish have safe defaults
  }
  const canNext = stepValid(step);
  const next = () => { if (canNext) setStep((s) => Math.min(s + 1, 3)); };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 40 }}>
      <Text style={styles.h1}>Launch a game</Text>

      {/* Step indicator */}
      <View style={styles.steps}>
        {STEPS.map((label, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <View key={label} style={styles.stepItem}>
              <View style={[styles.stepDot, active && styles.stepDotActive, done && styles.stepDotDone]}>
                <Text style={[styles.stepDotText, (active || done) && { color: colors.onAccent }]}>{done ? "✓" : i + 1}</Text>
              </View>
              <Text style={[styles.stepLabel, active && { color: colors.text, fontWeight: "800" }]}>{label}</Text>
            </View>
          );
        })}
      </View>

      {/* STEP 0 · Prize */}
      {step === 0 && (
        <>
          <CoverPicker bucket="covers" userId={user!.id} value={coverUrl} onChange={setCoverUrl} aspect={[16, 9]} />
          <Field label="Title" required>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Spring PEW Drop" placeholderTextColor={colors.faint} />
          </Field>
          <Field label="Prize">
            <TextInput style={styles.input} value={prize} onChangeText={setPrize} placeholder="e.g. PEW / $500 Cash" placeholderTextColor={colors.faint} />
          </Field>
          <Field label="Category" required>
            <View style={styles.catWrap}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity key={c} style={[styles.catChip, category === c && styles.catChipActive]} onPress={() => setCategory(c)}>
                  <Text style={[styles.catChipText, category === c && styles.catChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>
          <Field label="Description">
            <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="Details players should know…" placeholderTextColor={colors.faint} multiline />
          </Field>
        </>
      )}

      {/* STEP 1 · Tickets */}
      {step === 1 && (
        <>
          <View style={styles.row2}>
            <Field label="Paid seats (max 1000)" style={{ flex: 1 }} required>
              <TextInput style={styles.input} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" placeholder="e.g. 100" placeholderTextColor={colors.faint} />
            </Field>
            <Field label="Free seats (0 = none)" style={{ flex: 1 }}>
              <TextInput style={styles.input} value={freeLimit} onChangeText={setFreeLimit} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.faint} />
            </Field>
          </View>
          <Text style={styles.seatsNote}>
            {(() => {
              const cap = parseInt(capacity, 10) || 0;
              const free = parseInt(freeLimit, 10) || 0;
              if (!cap) return "Free seats are added on top of paid seats (e.g. 5 paid + 2 free = 7 total). Set free to 0 for none.";
              return free > 0
                ? `${cap} paid + ${free} free = ${cap + free} total seats. Free seats are a first-come bonus — they don't take a paid spot.`
                : `${cap} paid seats · no free seats.`;
            })()}
          </Text>
          <Field label="Entry word">
            <View style={styles.segment}>
              {TERMS.map((t) => (
                <TouchableOpacity key={t} style={[styles.segItem, term === t && styles.segItemActive]} onPress={() => setTerm(t)}>
                  <Text style={[styles.segText, term === t && styles.segTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>
          <Field label="Revenue goal for this game ($, optional)">
            <TextInput style={styles.input} value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder="e.g. 1000" placeholderTextColor={colors.faint} />
          </Field>
          <Field label={`Amount per ${term.toLowerCase()} ($)`} required>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="e.g. 10" placeholderTextColor={colors.faint} />
            <Text style={styles.helper}>
              {goal.trim()
                ? `Goal $${goal} ÷ ${paid} paid seat${paid === 1 ? "" : "s"} = $${amount || 0}/seat → sold out raises $${raised.toFixed(0)}${free > 0 ? ` (+ ${free} free seat${free === 1 ? "" : "s"}, no charge)` : ""}`
                : `Sold out ≈ $${raised.toFixed(0)} from ${paid} paid seat${paid === 1 ? "" : "s"}${free > 0 ? ` (+ ${free} free, no charge)` : ""}`}
            </Text>
          </Field>
        </>
      )}

      {/* STEP 2 · Rules */}
      {step === 2 && (
        <>
          <Field label="Draw mode">
            <View style={styles.segment}>
              {([["single", "Single pick"], ["elimination", "Last man standing"]] as const).map(([k, label]) => (
                <TouchableOpacity key={k} style={[styles.segItem, drawMode === k && styles.segItemActive]} onPress={() => setDrawMode(k)}>
                  <Text style={[styles.segText, drawMode === k && styles.segTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.helper}>
              {drawMode === "elimination"
                ? "Last man standing — it keeps drawing and eliminating seats round after round (each a signed Random.org draw) until one seat is left. That last seat standing wins."
                : "One signed Random.org pick decides the winner."}
            </Text>
          </Field>
          {drawMode === "single" && (
            <Field label="Winner reveal style">
              <View style={styles.segment}>
                {([["wheel", "Wheel"], ["scratch", "Scratch"], ["lotto", "Lotto"]] as const).map(([k, label]) => (
                  <TouchableOpacity key={k} style={[styles.segItem, drawStyle === k && styles.segItemActive]} onPress={() => setDrawStyle(k)}>
                    <Text style={[styles.segText, drawStyle === k && styles.segTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.helper}>How the winner is revealed. The winner is always drawn fairly via Random.org — the graphic just lands on it.</Text>
            </Field>
          )}
        </>
      )}

      {/* STEP 3 · Publish (preview + review + launch options) */}
      {step === 3 && (
        <>
          <Text style={styles.previewLabel}>PLAYER PREVIEW</Text>
          <View style={styles.previewWrap}>
            <GameCard
              data={{ id: "preview", title: title || "Untitled game", cover_url: coverUrl, amount_cents: Math.round((parseFloat(amount) || 0) * 100), capacity: cap || 1, claimed: 0 }}
              width={210}
              onPress={() => {}}
            />
          </View>

          <View style={styles.review}>
            <Text style={styles.reviewTitle}>{title || "Untitled game"}</Text>
            {prize ? <Text style={styles.reviewRow}>🏆 {prize}</Text> : null}
            <Text style={styles.reviewRow}>{cap} paid · {free} free · ${amount || 0}/seat</Text>
            <Text style={styles.reviewRow}>Sold out raises ${raised.toFixed(0)}{goal.trim() ? ` (goal $${goal})` : ""}</Text>
            <Text style={styles.reviewRow}>{drawMode === "elimination" ? "Last man standing draw" : `${drawStyle} reveal · single pick`}</Text>
          </View>

          <Field label="Schedule for later (optional) — leave blank to launch now">
            <DateTimeField value={scheduledAt} onChange={setScheduledAt} colors={colors} />
          </Field>

          <TouchableOpacity style={[styles.launchBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => create(scheduledAt ? "scheduled" : "open")}>
            {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.launchText}>{scheduledAt ? "🗓️ Schedule game" : "🚀 Launch now"}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.draftBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => create("draft")}>
            <Text style={styles.draftText}>Save as draft</Text>
          </TouchableOpacity>
          <Text style={styles.reviewNote}>
            {scheduledAt ? "Players will see a countdown and can ask to be notified when it opens." : "Launch now lets players claim seats immediately. Drafts stay private until you publish them."}
          </Text>
        </>
      )}

      {/* Footer nav */}
      <View style={styles.navRow}>
        {step > 0 ? (
          <TouchableOpacity style={[styles.navBtn, styles.navGhost]} onPress={back}>
            <Text style={[styles.navText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.navBtn, styles.navGhost]} onPress={() => router.back()}>
            <Text style={[styles.navText, { color: colors.text }]}>Cancel</Text>
          </TouchableOpacity>
        )}
        {step < 3 && (
          <TouchableOpacity style={[styles.navBtn, styles.navPrimary, !canNext && { opacity: 0.45 }]} disabled={!canNext} onPress={next}>
            <Text style={[styles.navText, { color: colors.onAccent }]}>Next</Text>
          </TouchableOpacity>
        )}
      </View>
      {!canNext && step < 3 && (
        <Text style={styles.reqHint}>{step === 0 ? "Add a title and pick a category to continue." : "Enter total seats (2+) and a seat price to continue."}</Text>
      )}
    </ScrollView>
  );
}

// Stable top-level component so text inputs don't lose focus on every keystroke.
function Field({ label, children, style, required }: { label: string; children: React.ReactNode; style?: any; required?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[{ marginBottom: 16 }, style]}>
      <Text style={{ color: colors.muted, fontSize: 12.5, fontWeight: "600", marginBottom: 8 }}>
        {label}{required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
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
  seatsNote: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: -6, marginBottom: 14 },
  catWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.surfaceAlt },
  catChipActive: { backgroundColor: colors.red, borderColor: colors.red },
  catChipText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  catChipTextActive: { color: colors.onAccent },
  segment: { flexDirection: "row", gap: 8 },
  segItem: { flex: 1, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.inputBorder, alignItems: "center", backgroundColor: colors.surfaceAlt },
  segItemActive: { backgroundColor: colors.red, borderColor: colors.red },
  segText: { color: colors.text, fontWeight: "600", fontSize: 14 },
  segTextActive: { color: colors.onAccent },
  // stepper
  steps: { flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  stepItem: { flex: 1, alignItems: "center", gap: 6 },
  stepDot: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  stepDotActive: { backgroundColor: colors.red, borderColor: colors.red },
  stepDotDone: { backgroundColor: colors.green, borderColor: colors.green },
  stepDotText: { color: colors.muted, fontWeight: "800", fontSize: 13 },
  stepLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  // review
  previewLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 10 },
  previewWrap: { alignItems: "center", marginBottom: 18 },
  launchBtn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 15, alignItems: "center", marginTop: 6 },
  launchText: { color: colors.onAccent, fontSize: 16, fontWeight: "800" },
  draftBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 13, alignItems: "center", marginTop: 10 },
  draftText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  review: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 18 },
  reviewTitle: { color: colors.text, fontSize: 20, fontWeight: "900", marginBottom: 8 },
  reviewRow: { color: colors.muted, fontSize: 14, marginTop: 4, textTransform: "capitalize" },
  reviewNote: { color: colors.faint, fontSize: 12, marginTop: 12, lineHeight: 16 },
  // footer nav
  navRow: { flexDirection: "row", gap: 12, marginTop: 22 },
  navBtn: { flex: 1, paddingVertical: 15, borderRadius: radius.md, alignItems: "center" },
  navGhost: { borderWidth: 1, borderColor: colors.border },
  navPrimary: { backgroundColor: colors.red },
  navText: { fontSize: 16, fontWeight: "800" },
  reqHint: { color: colors.danger, fontSize: 12, textAlign: "center", marginTop: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: 16 },
});
