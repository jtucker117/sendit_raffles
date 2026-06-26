import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, TextInput, Alert, Linking, Modal, useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { DrawWheel, WheelEntrant } from "@/components/DrawWheel";
import { DrawScratch } from "@/components/DrawScratch";
import { DrawLotto } from "@/components/DrawLotto";
import { DrawElimination, ElimRound } from "@/components/DrawElimination";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

interface Raffle {
  id: string; host_id: string; title: string; prize: string | null; description: string | null;
  cover_url: string | null; capacity: number; free_seat_limit: number; entry_word: string;
  amount_cents: number; status: string; draw_style?: "wheel" | "scratch" | "lotto";
  draw_mode?: "single" | "elimination";
}
interface Ticket { id: string; seat_number: number; owner_id: string; type: "free" | "paid"; status: string; }

type DrawStage = "idle" | "confirm" | "countdown" | "drawing" | "spinning" | "done" | "error";
const COUNTDOWN_SECONDS = 60;


export default function RaffleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isSuperadmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [pickNum, setPickNum] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draw, setDraw] = useState<any | null>(null);
  const [winnerName, setWinnerName] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [showData, setShowData] = useState(false);

  // Draw event state
  const [stage, setStage] = useState<DrawStage>("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [spinTo, setSpinTo] = useState<number | null>(null);
  const [elimRounds, setElimRounds] = useState<ElimRound[]>([]);
  const [liveWinner, setLiveWinner] = useState<{ name: string; seat: number } | null>(null);
  const [drawErr, setDrawErr] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
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
    if (!silent) setLoading(false);
  }, [id]);

  // Reload whenever the screen regains focus (e.g. returning from Manage entries)
  // so confirmed/pending counts and the draw button stay in sync.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Auto-verify the signature with Random.org as soon as a completed draw loads.
  useEffect(() => {
    if (draw && verifyMsg === null && !verifying) verifyDraw();
  }, [draw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown ticker -> when it hits 0, run the draw.
  useEffect(() => {
    if (stage !== "countdown") return;
    if (countdown <= 0) { executeDraw(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [stage, countdown]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  if (!raffle) return <View style={styles.center}><Text style={styles.muted}>Game not found.</Text></View>;

  const isHost = raffle.host_id === user?.id;
  const freeUsed = tickets.filter((t) => t.type === "free").length;
  const claimed = tickets.length;
  const open = raffle.capacity - claimed;
  const myFree = tickets.some((t) => t.type === "free" && t.owner_id === user?.id);
  const gridMode = raffle.capacity <= 120;
  const canPick = !isHost && raffle.status === "open";
  const soldPct = Math.min(100, Math.round((claimed / Math.max(raffle.capacity, 1)) * 100));
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
    router.push(`/checkout/${raffle!.id}?seats=${n}`);
  }

  function toggleSeat(n: number) {
    setSelected((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
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
      setElimRounds(((data as any).rounds as ElimRound[]) ?? []);
      setLiveWinner({ name: (data as any).winner_name, seat });
      setSpinTo(idx >= 0 ? idx : 0);
      setStage("spinning");
    } catch (e: any) {
      setDrawErr(e?.message ?? "Draw failed. Try again.");
      setStage("error");
    }
  }

  function onSpinEnd() { setStage("done"); load(true); } // silent refresh — don't unmount the wheel
  function closeDraw() { setStage("idle"); setSpinTo(null); }

  async function onCancel() {
    if (!confirmCancel) { setConfirmCancel(true); setTimeout(() => setConfirmCancel(false), 3000); return; }
    const { error } = await supabase.from("raffles").update({ status: "canceled" }).eq("id", raffle!.id);
    if (error) { Alert.alert("Cancel failed", error.message); return; }
    setConfirmCancel(false);
    await load();
  }

  // Superadmin only — permanent delete (cascades tickets + draws).
  async function onDelete() {
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return; }
    const { error } = await supabase.from("raffles").delete().eq("id", raffle!.id);
    if (error) { Alert.alert("Delete failed", error.message); return; }
    router.replace("/");
  }

  // Verify the draw against Random.org's API — every round for elimination, or
  // the single signed result for a single-pick draw.
  async function verifyDraw() {
    const roundSigs = ((draw?.rounds ?? []) as any[]).map((x) => x?.signed).filter((s) => s?.random && s?.signature);
    const items = roundSigs.length
      ? roundSigs
      : (draw?.randomorg_signed?.random && draw?.randomorg_signed?.signature ? [draw.randomorg_signed] : []);
    if (!items.length) return;
    setVerifying(true); setVerifyMsg(null);
    try {
      let ok = 0;
      for (const s of items) {
        const { data, error } = await supabase.functions.invoke("draw", { body: { verify: true, random: s.random, signature: s.signature } });
        if (error) {
          let detail = error.message;
          try { const b = await (error as any).context?.json?.(); if (b?.error) detail = b.error; } catch {}
          throw new Error(detail);
        }
        if ((data as any)?.error) throw new Error((data as any).error);
        if ((data as any)?.authentic) ok++;
      }
      const multi = items.length > 1;
      setVerifyMsg(ok === items.length
        ? (multi ? `✓ All ${items.length} rounds verified authentic by Random.org` : "✓ Verified authentic by Random.org")
        : `⚠️ Only ${ok}/${items.length} verified`);
    } catch (e: any) {
      setVerifyMsg(`Verify failed: ${e?.message ?? "try again"}`);
    } finally {
      setVerifying(false);
    }
  }

  const wheelSize = Math.min(width - 64, 340);
  const drawStyle = raffle.draw_style ?? "wheel";
  const drawMode = raffle.draw_mode ?? "single";
  const revealLabel = drawMode === "elimination" ? "LAST MAN STANDING" : drawStyle === "scratch" ? "SCRATCH TO REVEAL" : drawStyle === "lotto" ? "DRAWING" : "SPINNING";

  const CertRow = ({ k, v }: { k: string; v: string }) => (
    <View style={styles.certRow}>
      <Text style={styles.certK}>{k}</Text>
      <Text style={styles.certV}>{v}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + (canPick && selected.length > 0 ? 110 : 40) }}>
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
            {draw.rounds?.length ? (
              <Text style={styles.winnerSeat}>Decided over {draw.rounds.length} signed Random.org round{draw.rounds.length === 1 ? "" : "s"}</Text>
            ) : null}
            {draw.randomorg_signed ? (
              <View style={styles.certBox}>
                <Text style={styles.certTitle}>Random.org Signed Draw</Text>
                <CertRow k="Entrants" v={String(confirmedTickets.length)} />
                {draw.rounds?.length
                  ? <CertRow k="Rounds" v={String(draw.rounds.length)} />
                  : <CertRow k="Winning number" v={String(draw.randomorg_signed?.random?.data?.[0] ?? "—")} />}
                <CertRow k="Winning seat" v={`#${draw.winning_seat}`} />
                <CertRow k="Drawn" v={new Date(draw.drawn_at).toLocaleString()} />
                <Text style={styles.sigLabel}>SIGNATURE</Text>
                <Text style={styles.sig} numberOfLines={1}>{draw.randomorg_signed?.signature ?? ""}</Text>
                <TouchableOpacity onPress={verifyDraw} disabled={verifying}>
                  <Text style={[styles.verifyBadge, verifyMsg?.startsWith("✓") && styles.verifyBadgeOk]}>
                    {verifying ? "Verifying with Random.org…" : verifyMsg ?? "Tap to verify with Random.org"}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.verifyNote}>
                  Checked against Random.org's official verification API — proof the result is genuine and unaltered.
                </Text>

                <TouchableOpacity onPress={() => setShowData((s) => !s)}>
                  <Text style={styles.verifySub}>{showData ? "Hide signature data" : "Advanced: verify it yourself"}</Text>
                </TouchableOpacity>
                {showData && (
                  <View style={styles.dataBox}>
                    <Text style={styles.dataHelp}>
                      Paste each value into its matching field at Random.org's verifier to confirm independently.
                    </Text>
                    <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => Linking.openURL("https://api.random.org/signatures/form")}>
                      <Text style={[styles.btnText, { color: colors.text }]}>Open Random.org verifier →</Text>
                    </TouchableOpacity>
                    <Text style={styles.dataLabel}>RANDOM</Text>
                    <Text selectable style={styles.dataVal}>{JSON.stringify(draw.randomorg_signed?.random)}</Text>
                    <Text style={styles.dataLabel}>SIGNATURE</Text>
                    <Text selectable style={styles.dataVal}>{draw.randomorg_signed?.signature}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.singleNote}>Single entrant — awarded directly (no draw needed).</Text>
            )}
            <TouchableOpacity style={styles.shareResult} onPress={() => router.push(`/r/${raffle.id}`)}>
              <Text style={styles.shareResultText}>Share public result →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Sellout progress */}
        <View style={styles.sellout}>
          <View style={styles.selloutTop}>
            <Text style={styles.selloutSold}>{claimed} / {raffle.capacity} sold</Text>
            <Text style={styles.selloutPct}>{soldPct}%</Text>
          </View>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${soldPct}%` }]} /></View>
          <Text style={styles.selloutMeta}>{open} open · {freeUsed}/{raffle.free_seat_limit} free claimed · {money(raffle.amount_cents)}/seat</Text>
        </View>

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

        {/* Seat board / pick-your-seats */}
        <Text style={styles.boardTitle}>{canPick ? "Pick your seats" : "Seat board"}</Text>
        {gridMode ? (
          <View style={styles.board}>
            {Array.from({ length: raffle.capacity }, (_, i) => {
              const seat = i + 1;
              const taken = tickets.some((x) => x.seat_number === seat);
              const sel = selected.includes(seat);
              const tappable = canPick && !taken;
              return (
                <TouchableOpacity
                  key={seat}
                  activeOpacity={tappable ? 0.7 : 1}
                  disabled={!tappable}
                  onPress={() => toggleSeat(seat)}
                  style={[styles.seat, taken ? styles.seatTaken : sel ? styles.seatSelected : styles.seatOpen]}
                >
                  <Text style={[styles.seatNum, sel ? styles.seatNumSelected : taken ? styles.seatNumTaken : null]}>{seat}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View>
            <Text style={styles.bigNote}>{raffle.capacity} seats · {claimed} claimed.</Text>
            {canPick && (
              <View style={[styles.pickRow, { marginTop: 12 }]}>
                <TextInput style={styles.pickInput} placeholder="Seat #" placeholderTextColor={colors.faint} keyboardType="number-pad" value={pickNum} onChangeText={setPickNum} />
                <TouchableOpacity style={[styles.btn, styles.btnRed, { flex: 1, marginTop: 0 }]} onPress={paidPick}>
                  <Text style={[styles.btnText, { color: colors.onAccent }]}>Reserve seat — {money(raffle.amount_cents)}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        {canPick && gridMode && (
          <Text style={styles.legend}>Tap open seats to select · amber = your pick · grey = taken</Text>
        )}

        {/* Player extras: lucky dip + free seat */}
        {canPick && (
          <View style={{ gap: 10, marginTop: 14 }}>
            <TouchableOpacity style={[styles.btn, styles.btnOutline, open <= 0 && styles.btnDim]} disabled={open <= 0} onPress={() => router.push(`/checkout/${raffle.id}?random=1`)}>
              <Text style={[styles.btnText, { color: colors.text }]}>🎲 Lucky dip — random paid seat · {money(raffle.amount_cents)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnGreen, (claiming || myFree || freeUsed >= raffle.free_seat_limit || open <= 0) && styles.btnDim]}
              disabled={claiming || myFree || freeUsed >= raffle.free_seat_limit || open <= 0}
              onPress={() => claim("free", 0)}
            >
              <Text style={[styles.btnText, { color: colors.green }]}>
                {myFree ? "Free seat claimed" : freeUsed >= raffle.free_seat_limit ? "No free seats left" : "Claim free seat — random"}
              </Text>
            </TouchableOpacity>
            <Text style={styles.payNote}>Paid seats are confirmed by the host after payment (Venmo / Cash App / Card / PayPal / Zelle).</Text>
          </View>
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
              <TouchableOpacity style={[styles.btn, styles.btnOutline, { borderColor: colors.danger }]} onPress={onCancel}>
                <Text style={[styles.btnText, { color: colors.danger }]}>{confirmCancel ? "Tap again to cancel" : "Cancel game"}</Text>
              </TouchableOpacity>
            )}
            {raffle.status === "canceled" && <Text style={styles.canceledNote}>This game is canceled</Text>}
          </View>
        )}

        {/* Superadmin only — permanent delete (hosts can only cancel) */}
        {isSuperadmin && (
          <View style={{ marginTop: isHost ? 10 : 20, gap: 6 }}>
            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={onDelete}>
              <Text style={[styles.btnText, { color: colors.onAccent }]}>
                {confirmDelete ? "Tap again to permanently delete" : "Delete game (superadmin)"}
              </Text>
            </TouchableOpacity>
            <Text style={styles.dangerNote}>Permanent — removes the game and all its seats and draw records.</Text>
          </View>
        )}

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </View>
      </ScrollView>

      {/* Sticky buy bar (B-layout) */}
      {canPick && selected.length > 0 && (
        <View style={styles.buyBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.buyCount}>{selected.length} seat{selected.length === 1 ? "" : "s"} selected</Text>
            <Text style={styles.buySeats} numberOfLines={1}>{[...selected].sort((a, b) => a - b).map((n) => `#${n}`).join(", ")}</Text>
          </View>
          <TouchableOpacity style={styles.buyBtn} onPress={() => router.push(`/checkout/${raffle.id}?seats=${[...selected].sort((a, b) => a - b).join(",")}`)}>
            <Text style={styles.buyBtnText}>Checkout — {money(raffle.amount_cents * selected.length)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ---- Draw event overlay ---- */}
      <Modal visible={stage !== "idle"} transparent animationType="fade" onRequestClose={closeDraw}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {stage === "confirm" && (
              <>
                <Text style={styles.sheetTitle}>Run the draw</Text>
                <Text style={styles.sheetBody}>
                  This notifies entrants and starts a {COUNTDOWN_SECONDS}-second countdown, then the winner is revealed
                  {drawMode === "elimination" ? " — last man standing: it keeps drawing until one seat is left (multiple signed Random.org rounds)" : wheelEntrants.length >= 2 ? " using a signed Random.org draw" : ""}.
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
                <Text style={styles.sheetEyebrow}>{stage === "done" ? "🎉 WINNER" : revealLabel}</Text>
                <View style={{ alignItems: "center", marginVertical: 12, width: "100%" }}>
                  {stage === "drawing" ? (
                    <ActivityIndicator color={colors.red} size="large" style={{ marginVertical: 30 }} />
                  ) : drawMode === "elimination" && liveWinner ? (
                    <DrawElimination entrants={wheelEntrants} rounds={elimRounds} winnerSeat={liveWinner.seat} onDone={onSpinEnd} />
                  ) : drawStyle === "wheel" ? (
                    <DrawWheel entrants={wheelEntrants} spinTo={spinTo} onSpinEnd={onSpinEnd} size={wheelSize} />
                  ) : drawStyle === "scratch" && liveWinner ? (
                    <DrawScratch winnerName={liveWinner.name} winnerSeat={liveWinner.seat} onDone={onSpinEnd} />
                  ) : drawStyle === "lotto" && liveWinner ? (
                    <DrawLotto winnerSeat={liveWinner.seat} capacity={raffle.capacity} onDone={onSpinEnd} />
                  ) : null}
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
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  muted: { color: colors.muted },
  // sellout progress
  sellout: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, marginTop: 18 },
  selloutTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  selloutSold: { color: colors.text, fontSize: 16, fontWeight: "800" },
  selloutPct: { color: colors.red, fontSize: 16, fontWeight: "900" },
  bar: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.red },
  selloutMeta: { color: colors.muted, fontSize: 12, marginTop: 8 },
  legend: { color: colors.faint, fontSize: 12, marginTop: 10 },
  // selectable seats
  seatTaken: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  seatSelected: { backgroundColor: colors.red },
  seatNumSelected: { color: colors.onAccent },
  seatNumTaken: { color: colors.faint },
  // sticky buy bar
  buyBar: { position: "absolute", left: 0, right: 0, bottom: BOTTOM_NAV_HEIGHT, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 12 },
  buyCount: { color: colors.text, fontSize: 14, fontWeight: "800" },
  buySeats: { color: colors.muted, fontSize: 12, marginTop: 1 },
  buyBtn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 20, minWidth: 150, alignItems: "center" },
  buyBtnText: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
  cover: { width: "100%", height: 180, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
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
  shareResult: { marginTop: 14, backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 22 },
  shareResultText: { color: colors.onAccent, fontSize: 14, fontWeight: "800" },
  certBox: { width: "100%", backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 14 },
  certTitle: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  certRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  certK: { color: colors.muted, fontSize: 13 },
  certV: { color: colors.text, fontSize: 13, fontWeight: "600", fontFamily: "monospace" as any },
  sigLabel: { color: colors.faint, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 10 },
  sig: { color: colors.faint, fontSize: 10, fontFamily: "monospace" as any, marginTop: 3 },
  verify: { color: colors.red, fontSize: 13, fontWeight: "700", marginTop: 10 },
  verifyBadge: { color: colors.muted, fontSize: 14, fontWeight: "800", marginTop: 10 },
  verifyBadgeOk: { color: colors.green },
  verifyNote: { color: colors.faint, fontSize: 11, lineHeight: 15, marginTop: 4 },
  verifySub: { color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 10, textDecorationLine: "underline" },
  dataBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  dataHelp: { color: colors.muted, fontSize: 12, lineHeight: 16, marginBottom: 8 },
  dataLabel: { color: colors.faint, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 10 },
  dataVal: { color: colors.text, fontSize: 10, fontFamily: "monospace" as any, marginTop: 3, lineHeight: 14 },
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
  btnDanger: { backgroundColor: colors.danger },
  dangerNote: { color: colors.faint, fontSize: 11, textAlign: "center" },
  backBtn: { alignSelf: "center", marginTop: 22, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
  // overlay
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: 24, alignItems: "stretch" },
  sheetTitle: { color: colors.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  sheetEyebrow: { color: colors.red, fontSize: 13, fontWeight: "800", letterSpacing: 1.5, textAlign: "center" },
  sheetBody: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 },
  countNum: { color: colors.text, fontSize: 84, fontWeight: "900", marginVertical: 6, textAlign: "center" },
  winnerBig: { color: colors.text, fontSize: 30, fontWeight: "900", marginTop: 10, textAlign: "center" },
  warnBox: { backgroundColor: colors.amberSoft, borderColor: colors.amber, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 12 },
  warnText: { color: colors.text, fontSize: 13, lineHeight: 18, textAlign: "center" },
  sheetWarnSub: { color: colors.amber, fontSize: 12, marginTop: 10, textAlign: "center", lineHeight: 16 },
});
