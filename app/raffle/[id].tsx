import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, TextInput, Alert, Linking, Modal, useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { DrawWheel, WheelEntrant } from "@/components/DrawWheel";

interface Raffle {
  id: string; host_id: string; title: string; prize: string | null; description: string | null;
  cover_url: string | null; capacity: number; free_seat_limit: number; entry_word: string;
  amount_cents: number; status: string;
}
interface Ticket { id: string; seat_number: number; owner_id: string; type: "free" | "paid"; status: string; }

type DrawStage = "idle" | "confirm" | "countdown" | "drawing" | "spinning" | "done" | "error";
const COUNTDOWN_SECONDS = 60;

export default function RaffleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [pickNum, setPickNum] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [draw, setDraw] = useState<any | null>(null);
  const [winnerName, setWinnerName] = useState("");

  // Draw event state
  const [stage, setStage] = useState<DrawStage>("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [spinTo, setSpinTo] = useState<number | null>(null);
  const [liveWinner, setLiveWinner] = useState<{ name: string; seat: number } | null>(null);
  const [drawErr, setDrawErr] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: r }, { data: t }, { data: d }] = await Promise.all([
      supabase.from("raffles").select("*").eq("id", id).single(),
      supabase.from("tickets").select("*").eq("raffle_id", id).order("seat_number"),
      supabase.from("draws").select("*").eq("raffle_id", id).maybeSingle(),
    ]);
    if (r) setRaffle(r as Raffle);
    const ts = (t ?? []) as Ticket[];
    setTickets(ts);
    // Resolve owner display names (host/superadmin can read followers; players read what RLS allows)
    const ownerIds = [...new Set(ts.map((x) => x.owner_id))];
    if (ownerIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ownerIds);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.display_name; });
      setNames(map);
    } else setNames({});
    if (d) {
      setDraw(d);
      const { data: w } = await supabase.from("profiles").select("display_name").eq("id", d.winner_id).single();
      setWinnerName(w?.display_name ?? "Winner");
    } else { setDraw(null); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Countdown ticker -> when it hits 0, run the draw.
  useEffect(() => {
    if (stage !== "countdown") return;
    if (countdown <= 0) { executeDraw(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [stage, countdown]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  if (!raffle) return <View style={styles.center}><Text style={styles.muted}>Raffle not found.</Text></View>;

  const isHost = raffle.host_id === user?.id;
  const freeUsed = tickets.filter((t) => t.type === "free").length;
  const claimed = tickets.length;
  const open = raffle.capacity - claimed;
  const myFree = tickets.some((t) => t.type === "free" && t.owner_id === user?.id);
  const gridMode = raffle.capacity <= 120;
  const money = (c: number) => `$${(c / 100).toFixed(0)}`;
  const nameFor = (oid: string) => names[oid] ?? (oid === user?.id ? "You" : "Player");

  // Eligible entrants for the draw — confirmed only, ordered by seat to match the Edge Function.
  const confirmedTickets = tickets.filter((t) => t.status === "confirmed").sort((a, b) => a.seat_number - b.seat_number);
  const wheelEntrants: WheelEntrant[] = confirmedTickets.map((t) => ({ seat: t.seat_number, name: nameFor(t.owner_id) }));
  const pendingPaid = tickets.filter((t) => t.type === "paid" && t.status === "held");

  async function claim(type: "free" | "paid", seat: number) {
    setClaiming(true);
    try {
      const { error } = await supabase.rpc("claim_seat", { p_raffle: raffle!.id, p_seat: seat, p_type: type });
      if (error) throw error;
      setPickNum("");
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't claim seat", e?.message ?? "Try again.");
    } finally {
      setClaiming(false);
    }
  }

  function paidPick() {
    const n = parseInt(pickNum, 10);
    if (!(n >= 1 && n <= raffle!.capacity)) { Alert.alert("Enter a seat number", `1–${raffle!.capacity}`); return; }
    claim("paid", n);
  }

  // ---- Draw event flow ----
  function openDraw() {
    if (confirmedTickets.length < 1) { Alert.alert("No entries yet", "Confirm at least one entry before drawing."); return; }
    setDrawErr(""); setSpinTo(null); setLiveWinner(null);
    setCountdown(COUNTDOWN_SECONDS);
    setStage("confirm");
  }
  function startCountdown() { setCountdown(COUNTDOWN_SECONDS); setStage("countdown"); }
  function skipCountdown() { setCountdown(0); }

  async function executeDraw() {
    setStage("drawing");
    try {
      const { data, error } = await supabase.functions.invoke("draw", { body: { raffle_id: raffle!.id } });
      if (error) {
        let detail = error.message;
        try { const body = await (error as any).context?.json?.(); if (body?.error) detail = body.error; } catch {}
        throw new Error(detail);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      const seat = (data as any).winning_seat as number;
      const idx = wheelEntrants.findIndex((e) => e.seat === seat);
      setLiveWinner({ name: (data as any).winner_name, seat });
      setSpinTo(idx >= 0 ? idx : 0);
      setStage("spinning");
    } catch (e: any) {
      setDrawErr(e?.message ?? "Draw failed. Try again.");
      setStage("error");
    }
  }

  function onSpinEnd() { setStage("done"); load(); }
  function closeDraw() { setStage("idle"); setSpinTo(null); }

  async function onCancel() {
    if (!confirmCancel) { setConfirmCancel(true); setTimeout(() => setConfirmCancel(false), 3000); return; }
    const { error } = await supabase.from("raffles").update({ status: "canceled" }).eq("id", raffle!.id);
    if (error) { Alert.alert("Cancel failed", error.message); return; }
    setConfirmCancel(false);
    await load();
  }

  const wheelSize = Math.min(width - 64, 340);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      {raffle.cover_url ? <Image source={{ uri: raffle.cover_url }} style={styles.cover} /> : <View style={[styles.cover, styles.coverPh]} />}
      <View style={styles.pad}>
        <Text style={styles.title}>{raffle.title}</Text>
        {raffle.prize ? <Text style={styles.prize}>🏆 {raffle.prize}</Text> : null}
        {raffle.description ? <Text style={styles.desc}>{raffle.description}</Text> : null}

        {draw && (
          <View style={styles.winnerCard}>
            <Text style={styles.winnerEyebrow}>WINNER</Text>
            <Text style={styles.winnerName}>{winnerName}</Text>
            <Text style={styles.winnerSeat}>Seat #{draw.winning_seat}</Text>
            {draw.randomorg_signed ? (
              <View style={styles.certBox}>
                <Text style={styles.certTitle}>Random.org Signed Draw</Text>
                <CertRow k="Entrants" v={String(draw.randomorg_signed?.random?.max ?? "—")} />
                <CertRow k="Winning number" v={String(draw.randomorg_signed?.random?.data?.[0] ?? "—")} />
                <CertRow k="Drawn" v={new Date(draw.drawn_at).toLocaleString()} />
                <Text style={styles.sig} numberOfLines={3}>{draw.randomorg_signed?.signature ?? ""}</Text>
                <TouchableOpacity onPress={() => Linking.openURL(draw.verify_url || "https://www.random.org/")}>
                  <Text style={styles.verify}>Verify on Random.org →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.singleNote}>Single entrant — awarded directly (no draw needed).</Text>
            )}
          </View>
        )}

        <View style={styles.counts}>
          <Count label="Open" value={open} />
          <Count label={`Free (${raffle.free_seat_limit} max)`} value={freeUsed} />
          <Count label="Claimed" value={claimed} />
        </View>

        {!isHost && raffle.status === "open" && (
          <View style={styles.claimBox}>
            <Text style={styles.claimTitle}>Claim a seat</Text>
            <TouchableOpacity
              style={[styles.btn, styles.btnGreen, (claiming || myFree || freeUsed >= raffle.free_seat_limit || open <= 0) && styles.btnDim]}
              disabled={claiming || myFree || freeUsed >= raffle.free_seat_limit || open <= 0}
              onPress={() => claim("free", 0)}
            >
              <Text style={[styles.btnText, { color: colors.green }]}>
                🎟️ Free seat — random {myFree ? "(already claimed)" : ""}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnRed, (claiming || open <= 0) && styles.btnDim]} disabled={claiming || open <= 0} onPress={() => claim("paid", 0)}>
              <Text style={[styles.btnText, { color: colors.onAccent }]}>💳 Paid — random seat · {money(raffle.amount_cents)}</Text>
            </TouchableOpacity>
            <View style={styles.pickRow}>
              <TextInput style={styles.pickInput} placeholder="Seat #" placeholderTextColor={colors.faint} keyboardType="number-pad" value={pickNum} onChangeText={setPickNum} />
              <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }, (claiming || open <= 0) && styles.btnDim]} disabled={claiming || open <= 0} onPress={paidPick}>
                <Text style={[styles.btnText, { color: colors.text }]}>🎯 Paid — pick seat</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.payNote}>Paid seats are confirmed by the host after payment (Venmo/Zelle/Cash App/PayPal).</Text>
          </View>
        )}

        {/* Host: manage entries lives on its own page */}
        {isHost && (
          <TouchableOpacity style={styles.manageLink} onPress={() => router.push(`/raffle/manage/${raffle.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.manageLinkTitle}>Manage entries</Text>
              <Text style={styles.manageLinkSub}>
                {pendingPaid.length > 0 ? `${pendingPaid.length} pending payment${pendingPaid.length === 1 ? "" : "s"} · ` : ""}
                {confirmedTickets.length} confirmed
              </Text>
            </View>
            <Text style={styles.manageChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* Seat board */}
        <Text style={styles.boardTitle}>Seat board</Text>
        {gridMode ? (
          <View style={styles.board}>
            {Array.from({ length: raffle.capacity }, (_, i) => {
              const seat = i + 1;
              const t = tickets.find((x) => x.seat_number === seat);
              return (
                <View key={seat} style={[styles.seat, t?.type === "free" ? styles.seatFree : t?.type === "paid" ? styles.seatPaid : styles.seatOpen]}>
                  <Text style={[styles.seatNum, t ? styles.seatNumClaimed : null]}>{seat}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.bigNote}>{raffle.capacity} seats · {claimed} claimed · use “Pick seat” above to choose a number.</Text>
        )}

        {isHost && (
          <View style={{ marginTop: 20, gap: 10 }}>
            {raffle.status === "open" && (
              <TouchableOpacity
                style={[styles.btn, styles.btnRed, confirmedTickets.length < 1 && styles.btnDim]}
                disabled={confirmedTickets.length < 1}
                onPress={openDraw}
              >
                <Text style={[styles.btnText, { color: colors.onAccent }]}>
                  {confirmedTickets.length < 1 ? "Run the draw (need 1+ entry)" : "Run the draw"}
                </Text>
              </TouchableOpacity>
            )}
            {raffle.status !== "canceled" && raffle.status !== "complete" && (
              <TouchableOpacity style={[styles.btn, styles.btnOutline, { borderColor: colors.red }]} onPress={onCancel}>
                <Text style={[styles.btnText, { color: colors.red }]}>{confirmCancel ? "Tap again to cancel" : "Cancel raffle"}</Text>
              </TouchableOpacity>
            )}
            {raffle.status === "canceled" && <Text style={styles.canceledNote}>This raffle is canceled</Text>}
          </View>
        )}

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </View>

      {/* ---- Draw event overlay ---- */}
      <Modal visible={stage !== "idle"} transparent animationType="fade" onRequestClose={closeDraw}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {stage === "confirm" && (
              <>
                <Text style={styles.sheetTitle}>Run the draw</Text>
                <Text style={styles.sheetBody}>
                  This notifies entrants and starts a {COUNTDOWN_SECONDS}-second countdown, then the wheel spins to pick the winner
                  {wheelEntrants.length >= 2 ? " using a signed Random.org draw" : ""}.
                </Text>
                <Text style={styles.sheetBody}>{wheelEntrants.length} confirmed {wheelEntrants.length === 1 ? "entry" : "entries"}.</Text>
                {open > 0 && (
                  <View style={styles.warnBox}>
                    <Text style={styles.warnText}>
                      ⚠️ The board isn’t full — {open} of {raffle.capacity} seat{raffle.capacity === 1 ? "" : "s"} still open.
                      You can draw now, but make sure you’re okay running it early.
                    </Text>
                  </View>
                )}
                {pendingPaid.length > 0 && (
                  <Text style={styles.sheetWarnSub}>
                    {pendingPaid.length} pending payment{pendingPaid.length === 1 ? "" : "s"} won’t be entered — confirm them first if you want them in.
                  </Text>
                )}
                <TouchableOpacity style={[styles.btn, styles.btnRed]} onPress={startCountdown}>
                  <Text style={[styles.btnText, { color: colors.onAccent }]}>Start the draw</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={closeDraw}>
                  <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {stage === "countdown" && (
              <>
                <Text style={styles.sheetEyebrow}>📣 DRAW STARTING</Text>
                <Text style={styles.countNum}>{countdown}</Text>
                <Text style={styles.sheetBody}>Get ready — the wheel spins when the timer hits zero.</Text>
                <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={skipCountdown}>
                  <Text style={[styles.btnText, { color: colors.text }]}>Skip countdown</Text>
                </TouchableOpacity>
              </>
            )}

            {(stage === "drawing" || stage === "spinning" || stage === "done") && (
              <>
                <Text style={styles.sheetEyebrow}>{stage === "done" ? "🎉 WINNER" : "SPINNING"}</Text>
                <View style={{ alignItems: "center", marginVertical: 12 }}>
                  <DrawWheel entrants={wheelEntrants} spinTo={spinTo} onSpinEnd={onSpinEnd} size={wheelSize} />
                </View>
                {stage === "drawing" && <Text style={styles.sheetBody}>Selecting the winner…</Text>}
                {stage === "done" && liveWinner && (
                  <>
                    <Text style={styles.winnerBig}>{liveWinner.name}</Text>
                    <Text style={styles.sheetBody}>Seat #{liveWinner.seat}</Text>
                    <TouchableOpacity style={[styles.btn, styles.btnRed]} onPress={closeDraw}>
                      <Text style={[styles.btnText, { color: colors.onAccent }]}>Done</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}

            {stage === "error" && (
              <>
                <Text style={styles.sheetEyebrow}>DRAW FAILED</Text>
                <Text style={styles.sheetBody}>{drawErr}</Text>
                <TouchableOpacity style={[styles.btn, styles.btnRed]} onPress={openDraw}>
                  <Text style={[styles.btnText, { color: colors.onAccent }]}>Try again</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={closeDraw}>
                  <Text style={[styles.btnText, { color: colors.text }]}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.countItem}>
      <Text style={styles.countVal}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function CertRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.certRow}>
      <Text style={styles.certK}>{k}</Text>
      <Text style={styles.certV}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  muted: { color: colors.muted },
  cover: { width: "100%", height: 180 },
  coverPh: { backgroundColor: colors.navy },
  pad: { padding: 20 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  prize: { color: colors.muted, fontSize: 16, marginTop: 6 },
  desc: { color: colors.muted, fontSize: 14, marginTop: 10, lineHeight: 20 },
  winnerCard: { backgroundColor: colors.surface, borderColor: colors.red, borderWidth: 1, borderRadius: radius.lg, padding: 18, marginTop: 18, alignItems: "center" },
  winnerEyebrow: { color: colors.red, fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  winnerName: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 6 },
  winnerSeat: { color: colors.muted, fontSize: 14, marginTop: 2 },
  singleNote: { color: colors.muted, fontSize: 12, marginTop: 12, textAlign: "center" },
  certBox: { width: "100%", backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 14 },
  certTitle: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  certRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  certK: { color: colors.muted, fontSize: 13 },
  certV: { color: colors.text, fontSize: 13, fontWeight: "600", fontFamily: "monospace" as any },
  sig: { color: colors.faint, fontSize: 10, fontFamily: "monospace" as any, marginTop: 8, lineHeight: 14 },
  verify: { color: colors.red, fontSize: 13, fontWeight: "700", marginTop: 10 },
  counts: { flexDirection: "row", gap: 12, marginTop: 18, marginBottom: 6 },
  countItem: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, alignItems: "center" },
  countVal: { color: colors.text, fontSize: 22, fontWeight: "800" },
  countLabel: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: "center" },
  claimBox: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, marginTop: 16, gap: 10 },
  claimTitle: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  // manage link (host) -> sub-page
  manageLink: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, marginTop: 16 },
  manageLinkTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  manageLinkSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  manageChevron: { color: colors.muted, fontSize: 26, fontWeight: "700", marginLeft: 8 },
  btn: { paddingVertical: 13, borderRadius: radius.md, alignItems: "center", marginTop: 8 },
  btnGreen: { backgroundColor: colors.greenSoft },
  btnRed: { backgroundColor: colors.red },
  btnOutline: { borderWidth: 1, borderColor: colors.border },
  btnDim: { opacity: 0.45 },
  btnText: { fontSize: 15, fontWeight: "700" },
  pickRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  pickInput: { width: 90, backgroundColor: colors.surfaceAlt, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, color: colors.text, textAlign: "center", fontWeight: "700" },
  payNote: { color: colors.faint, fontSize: 11, lineHeight: 16 },
  boardTitle: { color: colors.text, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 24, marginBottom: 12 },
  board: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  seat: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  seatOpen: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  seatFree: { backgroundColor: colors.greenSoft },
  seatPaid: { backgroundColor: colors.redSoft },
  seatNum: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  seatNumClaimed: { color: colors.text },
  bigNote: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  canceledNote: { color: colors.red, textAlign: "center", fontWeight: "700", marginTop: 4 },
  backBtn: { alignSelf: "center", marginTop: 22, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
  // overlay
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: 22, alignItems: "center" },
  sheetTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  sheetEyebrow: { color: colors.red, fontSize: 13, fontWeight: "800", letterSpacing: 1.5 },
  sheetBody: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 },
  countNum: { color: colors.text, fontSize: 84, fontWeight: "900", marginVertical: 6 },
  winnerBig: { color: colors.text, fontSize: 30, fontWeight: "900", marginTop: 10, textAlign: "center" },
  warnBox: { backgroundColor: colors.amberSoft, borderColor: colors.amber, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 12 },
  warnText: { color: colors.text, fontSize: 13, lineHeight: 18, textAlign: "center" },
  sheetWarnSub: { color: colors.amber, fontSize: 12, marginTop: 10, textAlign: "center", lineHeight: 16 },
});
