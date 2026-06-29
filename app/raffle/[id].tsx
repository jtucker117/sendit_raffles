import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, TextInput, Alert, Linking, Modal, useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { showError } from "@/lib/notify";
import { radius, AppColors } from "@/lib/theme";
import { DrawWheel, WheelEntrant } from "@/components/DrawWheel";
import { DrawScratch } from "@/components/DrawScratch";
import { DrawLotto } from "@/components/DrawLotto";
import { DrawElimination, ElimRound } from "@/components/DrawElimination";
import { Confetti } from "@/components/Confetti";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

interface Raffle {
  id: string; host_id: string; title: string; prize: string | null; description: string | null;
  cover_url: string | null; capacity: number; free_seat_limit: number; entry_word: string;
  amount_cents: number; status: string; draw_style?: "wheel" | "scratch" | "lotto";
  draw_mode?: "single" | "elimination";
  parent_raffle_id?: string | null; seats_awarded?: number;
  scheduled_at?: string | null; show_odds?: boolean; featured?: boolean;
  free_for_all?: boolean; bogo?: boolean; no_seats?: boolean;
}
interface Ticket { id: string; seat_number: number; owner_id: string; type: "free" | "paid"; status: string; mini_id?: string | null; }

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
  const [minis, setMinis] = useState<any[]>([]);
  const [parentName, setParentName] = useState("");
  const [parentBogo, setParentBogo] = useState(false);
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
  const [myNotify, setMyNotify] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [buyQty, setBuyQty] = useState(1);

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    const [{ data: r }, { data: t }, { data: d }] = await Promise.all([
      supabase.from("raffles").select("*").eq("id", id).single(),
      supabase.from("tickets").select("*").eq("raffle_id", id).order("seat_number"),
      supabase.from("draws").select("*").eq("raffle_id", id).maybeSingle(),
    ]);
    let rr = r as Raffle | null;
    // A scheduled game whose time has arrived auto-opens.
    if (rr && rr.status === "scheduled" && rr.scheduled_at && new Date(rr.scheduled_at).getTime() <= Date.now()) {
      await supabase.from("raffles").update({ status: "open" }).eq("id", rr.id);
      rr = { ...rr, status: "open" };
    }
    if (rr) setRaffle(rr);
    // Am I on the notify list for this game?
    if (user?.id) {
      const { data: gn } = await supabase.from("game_notify").select("user_id").eq("raffle_id", id).eq("user_id", user.id).maybeSingle();
      setMyNotify(!!gn);
    }
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
    // Mini games hanging off this game (+ the parent, if this one is a mini)
    const { data: kids } = await supabase.from("raffles").select("id, title, cover_url, status, capacity, seats_awarded").eq("parent_raffle_id", id).order("created_at");
    setMinis(kids ?? []);
    if ((r as any)?.parent_raffle_id) {
      const { data: par } = await supabase.from("raffles").select("title, bogo").eq("id", (r as any).parent_raffle_id).maybeSingle();
      setParentName(par?.title ?? "the main game");
      setParentBogo(!!(par as any)?.bogo);
    } else { setParentName(""); setParentBogo(false); }
    if (!silent) setLoading(false);
  }, [id]);

  // Reload whenever the screen regains focus (e.g. returning from Manage entries)
  // so confirmed/pending counts and the draw button stay in sync.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Tick once a second so scheduled countdowns update live.
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 1000); return () => clearInterval(t); }, []);

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
  const paidUsed = tickets.filter((t) => t.type === "paid").length;
  const claimed = tickets.length;
  // Free seats are ADDED ON TOP of the paid capacity (paid 1..capacity, free above).
  // Stretch the board to cover any ticket numbered above capacity — BOGO/free-for-all
  // seats live there and aren't counted in free_seat_limit, so they'd be hidden.
  const maxTicketSeat = tickets.reduce((m, t) => Math.max(m, t.seat_number), 0);
  const totalSeats = Math.max(raffle.capacity + (raffle.free_seat_limit ?? 0), maxTicketSeat);
  // Open paid-block seats = capacity minus every seat occupying it (player paid,
  // mini-reserved, AND mini-won — the last are type 'free' so paidUsed misses them).
  const open = raffle.capacity - tickets.filter((t) => t.seat_number <= raffle.capacity).length;
  const myFree = tickets.some((t) => t.type === "free" && t.owner_id === user?.id);
  const gridMode = raffle.capacity <= 120;
  const canPick = !isHost && raffle.status === "open";
  // Mini-reserved seats are the mini's prize — not buyable, not "sold to players".
  const reservedCount = tickets.filter((t) => t.status === "reserved").length;
  // Every seat tied to a mini (still reserved OR already won) occupies the paid
  // block and is never buyable — so it must stay out of the sellable pool even
  // after the mini draws and the seat flips from 'reserved' to the winner.
  const miniSeats = tickets.filter((t) => !!t.mini_id).length;
  const sellablePaid = Math.max(0, raffle.capacity - miniSeats);
  const paidSold = tickets.filter((t) => t.type === "paid" && !t.mini_id).length;
  const soldPct = Math.min(100, Math.round((paidSold / Math.max(sellablePaid, 1)) * 100));
  const freeLeft = Math.max(0, (raffle.free_seat_limit ?? 0) - freeUsed);
  const paidLeft = Math.max(0, sellablePaid - paidSold);
  const freeForAll = !!raffle.free_for_all;
  const isBogo = !!raffle.bogo;
  const totalLabel = freeForAll ? `${raffle.capacity} paid + free for all` : isBogo ? `${raffle.capacity} paid · BOGO` : `${totalSeats} seats`;
  const freeAvailable = freeForAll ? true : freeLeft > 0; // can a player still claim a free seat?
  // Full field at sell-out: every capacity seat is a real entry (mini-reserved
  // seats are held by the mini winner and still compete), plus any free seats.
  // BOGO: each *buyable* paid seat also earns a free twin, so the field is the
  // paid block + one free per sellable seat. A BOGO purchase = 2 entries.
  const entriesPerBuy = isBogo ? 2 : 1;
  const oddsTotal = isBogo
    ? raffle.capacity + sellablePaid
    : raffle.capacity + (raffle.free_seat_limit ?? 0);
  const money = (c: number) => `$${c % 100 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;
  const nameFor = (oid: string) => names[oid] ?? (oid === user?.id ? "You" : "Player");

  // Draft / scheduled state
  const isDraft = raffle.status === "draft";
  const goLiveMs = raffle.scheduled_at ? new Date(raffle.scheduled_at).getTime() : 0;
  const isUpcoming = raffle.status === "scheduled" && goLiveMs > nowMs;
  const goLiveStr = raffle.scheduled_at ? new Date(raffle.scheduled_at).toLocaleString() : "";
  const countdownText = (() => {
    const s = Math.max(0, Math.floor((goLiveMs - nowMs) / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${ss}s` : `${m}m ${ss}s`;
  })();

  async function toggleNotify() {
    if (!user?.id) return;
    if (myNotify) {
      await supabase.from("game_notify").delete().eq("raffle_id", raffle!.id).eq("user_id", user.id);
      setMyNotify(false);
    } else {
      const { error } = await supabase.from("game_notify").insert({ raffle_id: raffle!.id, user_id: user.id });
      if (error) { showError(error, "Couldn't set reminder"); return; }
      setMyNotify(true);
    }
  }
  async function publishDraft() {
    const { error } = await supabase.from("raffles").update({ status: "open", scheduled_at: null }).eq("id", raffle!.id);
    if (error) { showError(error, "Couldn't publish"); return; }
    load();
  }
  async function toggleFeatured() {
    if (raffle!.featured) {
      const { error } = await supabase.from("raffles").update({ featured: false }).eq("id", raffle!.id);
      if (error) { showError(error, "Couldn't update featured"); return; }
    } else {
      // One featured game per host per day during beta; featuring a new one replaces the old.
      const { error } = await supabase.rpc("feature_game", { p_game: raffle!.id });
      if (error) { showError(error, "Couldn't feature"); return; }
    }
    load();
  }

  // Eligible entrants for the draw — confirmed only, ordered by seat to match the Edge Function.
  const confirmedTickets = tickets.filter((t) => t.status === "confirmed").sort((a, b) => a.seat_number - b.seat_number);
  const myConfirmed = confirmedTickets.filter((t) => t.owner_id === user?.id).length;
  // Live odds preview as the player picks seats / a quantity.
  const mySeatsNow = tickets.filter((t) => t.owner_id === user?.id).length; // seats I already hold (held or confirmed)
  const picking = raffle.no_seats ? Math.min(buyQty, Math.max(paidLeft, 0)) : selected.length;
  const myProjSeats = mySeatsNow + picking * entriesPerBuy; // BOGO: each pick also brings a free seat
  const projPct = oddsTotal > 0 ? (myProjSeats / oddsTotal) * 100 : 0;
  const wheelEntrants: WheelEntrant[] = confirmedTickets.map((t) => ({ seat: t.seat_number, name: nameFor(t.owner_id) }));
  const pendingPaid = tickets.filter((t) => t.type === "paid" && t.status === "held");
  // Can't draw the main game while payments are pending or any mini is unfinished.
  const openMinis = minis.filter((m: any) => m.status !== "complete" && m.status !== "canceled");
  const drawBlocked = confirmedTickets.length < 1 || pendingPaid.length > 0 || openMinis.length > 0;
  // Cancel guard: no open minis (parent only) and no player-claimed seats.
  // Mini-reserved seats are host-owned, so they don't count as player claims.
  const playerSeats = tickets.filter((t) => t.owner_id !== raffle!.host_id);
  const cancelBlockReason =
    !raffle!.parent_raffle_id && openMinis.length > 0
      ? `Cancel the ${openMinis.length} open mini${openMinis.length === 1 ? "" : "s"} first (remove their players, then cancel each mini).`
      : playerSeats.length > 0
      ? `Remove all ${playerSeats.length} player seat${playerSeats.length === 1 ? "" : "s"} in Manage entries first.`
      : "";
  const drawLabel =
    confirmedTickets.length < 1 ? "Run the draw (need 1+ entry)"
    : pendingPaid.length > 0 ? `Confirm ${pendingPaid.length} pending payment${pendingPaid.length === 1 ? "" : "s"} first`
    : openMinis.length > 0 ? `Finish ${openMinis.length} mini${openMinis.length === 1 ? "" : "s"} first`
    : "Run the draw";

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
    if (pendingPaid.length > 0) {
      Alert.alert("Pending payments", `Mark all ${pendingPaid.length} pending payment${pendingPaid.length === 1 ? "" : "s"} as paid (or remove them) before drawing — every entry must be confirmed so they're on the wheel.`);
      return;
    }
    if (openMinis.length > 0) {
      Alert.alert("Finish minis first", `Run all ${openMinis.length} mini${openMinis.length === 1 ? "" : "s"} for this game before drawing the main game.`);
      return;
    }
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
    if (cancelBlockReason) { Alert.alert("Can't cancel yet", cancelBlockReason); return; }
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
    if (error) { showError(error, "Delete failed"); return; }
    // Return to the host's dashboard (where they manage games) rather than the public Games page.
    router.replace(isHost ? "/host/dashboard" : "/");
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
  const isMini = !!raffle.parent_raffle_id;
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
      <View>
        {raffle.cover_url ? <Image source={{ uri: raffle.cover_url }} style={styles.cover} blurRadius={isUpcoming ? 16 : 0} /> : <View style={[styles.cover, styles.coverPh]} />}
        {isUpcoming && (
          <View style={styles.soonOverlay}>
            <Text style={styles.soonEyebrow}>🔒 COMING SOON</Text>
            <Text style={styles.soonCountdown}>{countdownText}</Text>
            <Text style={styles.soonWhen}>Goes live {goLiveStr}</Text>
          </View>
        )}
      </View>
      <View style={styles.pad}>
        {isDraft && (
          <View style={styles.draftBanner}>
            <Text style={styles.draftBannerText}>📝 Draft — only you can see this. Publish it when you're ready.</Text>
            {isHost && (
              <TouchableOpacity style={styles.draftPublish} onPress={publishDraft}>
                <Text style={styles.draftPublishText}>Publish now</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {isUpcoming && !isHost && (
          <TouchableOpacity style={[styles.notifyBtn, myNotify && styles.notifyOn]} onPress={toggleNotify}>
            <Text style={[styles.notifyText, myNotify && styles.notifyTextOn]}>{myNotify ? "🔔 You'll be notified when it opens" : "🔔 Notify me when it opens"}</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>{raffle.title}</Text>
        {raffle.prize ? <Text style={styles.prizeBold}>🏆 {raffle.prize}</Text> : null}
        <Text style={styles.priceTop}>{money(raffle.amount_cents)} per {raffle.no_seats ? "entry" : "seat"}</Text>
        {raffle.description ? <Text style={styles.desc}>{raffle.description}</Text> : null}

        {isMini && (
          <TouchableOpacity style={styles.miniBanner} onPress={() => raffle.parent_raffle_id && router.push(`/raffle/${raffle.parent_raffle_id}`)}>
            <Text style={styles.miniBannerText}>
              🎟️ Mini game — the winner gets {raffle.seats_awarded ?? 1} seat{(raffle.seats_awarded ?? 1) === 1 ? "" : "s"} in {parentName || "the main game"}. Tap to view it →
            </Text>
          </TouchableOpacity>
        )}

        {isMini && parentBogo && (
          <View style={styles.miniBogoNote}>
            <Text style={styles.miniBogoText}>
              ⚠️ No BOGO on this mini. {parentName || "The main game"} is a BOGO game, but BOGO only applies to purchased main seats — the prize seats you win here do not earn extra free seats.
            </Text>
          </View>
        )}

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
                {draw.rounds?.length ? <CertRow k="Rounds" v={String(draw.rounds.length)} /> : null}
                <CertRow k="Winning number" v={`#${draw.winning_seat}`} />
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
            <Text style={styles.selloutSold}>{totalLabel}</Text>
            <Text style={styles.selloutPct}>{soldPct}% sold</Text>
          </View>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${soldPct}%` }]} /></View>
          <Text style={styles.selloutMeta}>
            {paidLeft} of {sellablePaid} paid left · {money(raffle.amount_cents)}/seat
            {reservedCount > 0 ? ` · 🔒 ${reservedCount} reserved for minis` : ""}
            {freeForAll ? " · 🎁 1 free seat each" : isBogo ? " · 🎁 buy 1 get 1 free" : (raffle.free_seat_limit ?? 0) > 0 ? ` · ${freeLeft} of ${raffle.free_seat_limit} free left` : ""}
          </Text>
          {raffle.show_odds !== false && raffle.status !== "complete" && oddsTotal > 0 && (
            <View style={styles.oddsRow}>
              {isBogo
                ? <Text style={styles.oddsLine}>🎲 Odds: each paid seat = <Text style={styles.oddsStrong}>2 entries</Text> · ~{(100 * 2 / oddsTotal).toFixed(1)}% per purchase at sell-out (pool of {oddsTotal})</Text>
                : <Text style={styles.oddsLine}>🎲 Odds: <Text style={styles.oddsStrong}>1 in {oddsTotal}</Text> per seat ({(100 / oddsTotal).toFixed(1)}%)</Text>}
              {myConfirmed > 0 && confirmedTickets.length > 0 && (
                <Text style={styles.oddsSub}>Your odds right now: {((myConfirmed / confirmedTickets.length) * 100).toFixed(1)}% ({myConfirmed} of {confirmedTickets.length} entered)</Text>
              )}
              {canPick && myProjSeats > 0 && (
                <Text style={styles.oddsProj}>
                  🎯 {picking > 0 ? `With ${picking} more` : "With your"} {myProjSeats === 1 ? "seat" : "seats"} you'd have <Text style={styles.oddsStrong}>{projPct.toFixed(1)}%</Text> to win at sell-out ({myProjSeats} of {oddsTotal})
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Minis hanging off this game */}
        {!isMini && (minis.length > 0 || isHost) && (
          <View style={styles.miniSection}>
            <View style={styles.miniHead}>
              <Text style={styles.boardTitle}>Mini games</Text>
              {isHost && raffle.status === "open" && (
                <TouchableOpacity style={styles.miniAddBtn} activeOpacity={0.85} onPress={() => router.push(`/host/mini/${raffle.id}`)}>
                  <Text style={styles.miniAddBtnText}>+ Create mini</Text>
                </TouchableOpacity>
              )}
            </View>
            {minis.length === 0 ? (
              <Text style={styles.bigNote}>No minis yet. A mini is a smaller game whose winner gets seats in this one.</Text>
            ) : (
              minis.map((m) => {
                const cover = m.cover_url ?? raffle.cover_url; // minis default to the parent's image
                const label = /^Mini \d+/.exec(m.title)?.[0] ?? m.title;
                return (
                  <TouchableOpacity key={m.id} style={styles.miniRow} onPress={() => router.push(`/raffle/${m.id}`)}>
                    {cover ? <Image source={{ uri: cover }} style={styles.miniThumb} /> : <View style={[styles.miniThumb, { backgroundColor: colors.navy }]} />}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniRowTitle} numberOfLines={1}>{label}</Text>
                      <Text style={styles.miniRowMeta}>Winner gets {m.seats_awarded ?? 1} seat{(m.seats_awarded ?? 1) === 1 ? "" : "s"} · {m.status}</Text>
                    </View>
                    <Text style={styles.manageChevron}>›</Text>
                  </TouchableOpacity>
                );
              })
            )}
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

        {/* Seat board / pick-your-seats — or a quantity picker for no-seat games */}
        <Text style={styles.boardTitle}>{raffle.no_seats ? "Entries" : canPick ? "Pick your seats" : "Seat board"}</Text>
        {raffle.no_seats ? (
          canPick ? (
            <View style={styles.qtyBox}>
              <Text style={styles.qtyLabel}>How many entries?</Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => setBuyQty((q) => Math.max(1, q - 1))}><Text style={styles.qtyBtnText}>−</Text></TouchableOpacity>
                <Text style={styles.qtyVal}>{Math.min(buyQty, Math.max(paidLeft, 1))}</Text>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => setBuyQty((q) => Math.min(paidLeft, q + 1))}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
              </View>
              <TouchableOpacity style={[styles.btn, styles.btnRed, { alignSelf: "stretch" }, paidLeft <= 0 && styles.btnDim]} disabled={paidLeft <= 0} onPress={() => router.push(`/checkout/${raffle.id}?random=${Math.min(buyQty, paidLeft)}`)}>
                <Text style={[styles.btnText, { color: colors.onAccent }]}>{paidLeft <= 0 ? "Sold out" : `Reserve ${Math.min(buyQty, paidLeft)} entr${Math.min(buyQty, paidLeft) === 1 ? "y" : "ies"} — ${money(raffle.amount_cents * Math.min(buyQty, paidLeft))}`}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.bigNote}>{paidSold + miniSeats} of {raffle.capacity} entries in · {paidLeft} left.{miniSeats > 0 ? ` (${miniSeats} mini)` : ""}</Text>
          )
        ) : gridMode ? (
          <ScrollView
            style={styles.boardScroll}
            contentContainerStyle={styles.board}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {Array.from({ length: totalSeats }, (_, i) => {
              const seat = i + 1;
              const isFree = seat > raffle.capacity; // free seats are numbered above the paid block
              const t = tickets.find((x) => x.seat_number === seat);
              const taken = !!t;
              const reserved = t?.status === "reserved"; // held for a mini
              const sel = selected.includes(seat);
              const tappable = canPick && !taken && !isFree; // free seats are claimed via the button, not picked
              return (
                <TouchableOpacity
                  key={seat}
                  activeOpacity={tappable ? 0.7 : 1}
                  disabled={!tappable}
                  onPress={() => toggleSeat(seat)}
                  style={[styles.seat, taken ? styles.seatTaken : sel ? styles.seatSelected : isFree ? styles.seatFree : styles.seatOpen]}
                >
                  <Text style={[styles.seatNum, sel ? styles.seatNumSelected : taken ? styles.seatNumTaken : isFree ? styles.seatNumFree : null]}>{reserved ? "🔒" : isFree && !taken ? "🎁" : seat}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
        {canPick && gridMode && !raffle.no_seats && (
          <Text style={styles.legend}>Tap open seats · amber = your pick · grey = taken · 🔒 = mini · 🎁 = free seat</Text>
        )}

        {/* Players — every seat (open + taken); for no-seat games, every entry */}
        {(() => {
          // Seated games enumerate every seat (incl. BOGO/free seats above capacity);
          // no-seat games just list the entries.
          const rows = raffle.no_seats
            ? [...tickets].sort((a, b) => a.seat_number - b.seat_number).map((t) => ({ seat: t.seat_number, t, isFreeSlot: t.type === "free" }))
            : Array.from({ length: totalSeats }, (_, i) => {
                const seat = i + 1;
                return { seat, t: tickets.find((x) => x.seat_number === seat) ?? null, isFreeSlot: seat > raffle.capacity };
              });
          if (rows.length === 0) return null;
          const paidCount = tickets.filter((t) => t.status === "confirmed" && t.type === "paid").length;
          const pendCount = tickets.filter((t) => t.status === "held").length;
          return (
            <View style={styles.entriesSection}>
              <Text style={styles.boardTitle}>Players</Text>
              <Text style={styles.entriesSub}>
                ✅ {paidCount} paid{pendCount > 0 ? ` · ⏳ ${pendCount} awaiting payment` : ""}
              </Text>
              <ScrollView style={styles.entriesScroll} nestedScrollEnabled showsVerticalScrollIndicator>
                {rows.map(({ seat, t, isFreeSlot }) => {
                  const reserved = t?.status === "reserved";
                  const miniWon = !!t && !!t.mini_id && t.status === "confirmed"; // reserved seat handed to the mini winner
                  const isFreeSeat = t?.type === "free" && !miniWon;
                  const paid = t?.status === "confirmed" && t?.type === "paid";
                  const mine = !!t && user?.id === t.owner_id && !reserved;
                  let who: string, label: string, tone: string, bg: string;
                  if (!t) {
                    who = isFreeSlot ? "Open free seat" : "Open seat";
                    label = isFreeSlot ? "🎁 Free" : "Open";
                    tone = isFreeSlot ? colors.green : colors.muted;
                    bg = isFreeSlot ? colors.greenSoft : colors.surfaceAlt;
                  } else if (reserved) {
                    who = "Reserved for a mini"; label = "🔒 Mini"; tone = colors.muted; bg = colors.surfaceAlt;
                  } else if (miniWon) {
                    who = names[t.owner_id] ?? "Player"; label = "🏆 Mini win"; tone = colors.red; bg = colors.redSoft;
                  } else {
                    who = names[t.owner_id] ?? "Player";
                    label = isFreeSeat ? "🎁 Free" : paid ? "Paid" : "Unpaid";
                    tone = (paid || isFreeSeat) ? colors.green : colors.red;
                    bg = (paid || isFreeSeat) ? colors.greenSoft : colors.redSoft;
                  }
                  return (
                    <View key={seat} style={styles.entRow}>
                      <Text style={styles.entSeat}>#{seat}</Text>
                      <Text style={[styles.entName, mine && styles.entNameMine, !t && styles.entNameOpen]} numberOfLines={1}>{who}{mine ? " (you)" : ""}</Text>
                      <View style={[styles.entPill, { backgroundColor: bg }]}><Text style={[styles.entPillText, { color: tone }]}>{label}</Text></View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          );
        })()}

        {/* Player extras: lucky dip + free seat */}
        {canPick && (
          <View style={{ gap: 10, marginTop: 14 }}>
            {!raffle.no_seats && (
              <TouchableOpacity style={[styles.btn, styles.btnOutline, paidLeft <= 0 && styles.btnDim]} disabled={paidLeft <= 0} onPress={() => router.push(`/checkout/${raffle.id}?random=1`)}>
                <Text style={[styles.btnText, { color: colors.text }]}>🎲 {paidLeft <= 0 ? "No paid seats left" : `Lucky dip — random paid seat · ${money(raffle.amount_cents)}`}</Text>
              </TouchableOpacity>
            )}
            {isBogo ? (
              <Text style={styles.bogoNote}>🎁 Buy one, get one free — your free seat is added automatically when the host confirms your payment.</Text>
            ) : (freeForAll || (raffle.free_seat_limit ?? 0) > 0) ? (
              <TouchableOpacity
                style={[styles.btn, styles.btnGreen, (claiming || myFree || !freeAvailable) && styles.btnDim]}
                disabled={claiming || myFree || !freeAvailable}
                onPress={() => claim("free", 0)}
              >
                <Text style={[styles.btnText, { color: colors.green }]}>
                  {myFree ? "Free seat claimed ✓" : !freeAvailable ? "No free seats left" : freeForAll ? "🎁 Claim your free seat" : "Claim free seat — random"}
                </Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.payNote}>Paid seats are confirmed by the host after payment (Venmo / Cash App / Card / PayPal / Zelle).</Text>
          </View>
        )}

        {isHost && (
          <View style={{ marginTop: 20, gap: 10 }}>
            {raffle.status === "open" && (
              <TouchableOpacity
                style={[styles.btn, styles.btnRed, drawBlocked && styles.btnDim]}
                disabled={drawBlocked}
                onPress={openDraw}
              >
                <Text style={[styles.btnText, { color: colors.onAccent }]}>{drawLabel}</Text>
              </TouchableOpacity>
            )}
            {raffle.status === "open" && (
              <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => router.push(`/host/edit/${raffle.id}`)}>
                <Text style={[styles.btnText, { color: colors.text }]}>Edit game</Text>
              </TouchableOpacity>
            )}
            {!isMini && (
              <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => router.push(`/host/create-raffle?from=${raffle.id}`)}>
                <Text style={[styles.btnText, { color: colors.text }]}>🔁 Duplicate / relaunch</Text>
              </TouchableOpacity>
            )}
            {raffle.status === "open" && (
              <>
                <TouchableOpacity style={[styles.btn, raffle.featured ? styles.btnRed : styles.btnOutline]} onPress={toggleFeatured}>
                  <Text style={[styles.btnText, { color: raffle.featured ? colors.onAccent : colors.text }]}>{raffle.featured ? "⭐ Featured on home — tap to remove" : "⭐ Feature on home (BETA)"}</Text>
                </TouchableOpacity>
              </>
            )}
            {raffle.status !== "canceled" && raffle.status !== "complete" && (
              <>
                <TouchableOpacity style={[styles.btn, styles.btnOutline, { borderColor: colors.danger }, cancelBlockReason && styles.btnDim]} onPress={onCancel}>
                  <Text style={[styles.btnText, { color: colors.danger }]}>{confirmCancel ? "Tap again to cancel" : "Cancel game"}</Text>
                </TouchableOpacity>
                {cancelBlockReason ? <Text style={styles.cancelHint}>⚠️ {cancelBlockReason}</Text> : null}
              </>
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
            {raffle.show_odds !== false && oddsTotal > 0
              ? <Text style={styles.buySeats} numberOfLines={1}>🎯 {projPct.toFixed(1)}% to win at sell-out</Text>
              : <Text style={styles.buySeats} numberOfLines={1}>{[...selected].sort((a, b) => a - b).map((n) => `#${n}`).join(", ")}</Text>}
          </View>
          <TouchableOpacity style={styles.buyBtn} onPress={() => router.push(`/checkout/${raffle.id}?seats=${[...selected].sort((a, b) => a - b).join(",")}`)}>
            <Text style={styles.buyBtnText}>Checkout — {money(raffle.amount_cents * selected.length)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ---- Draw event overlay ---- */}
      <Modal visible={stage !== "idle"} transparent animationType="fade" onRequestClose={closeDraw}>
        <View style={styles.overlay}>
          {stage === "done" && <Confetti />}
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
  oddsRow: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  oddsLine: { color: colors.text, fontSize: 13, fontWeight: "600" },
  oddsStrong: { color: colors.red, fontWeight: "900" },
  oddsSub: { color: colors.muted, fontSize: 12, marginTop: 3 },
  oddsProj: { color: colors.red, fontSize: 12.5, fontWeight: "700", marginTop: 5 },
  miniBanner: { backgroundColor: colors.redSoft, borderColor: colors.red, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 14 },
  miniBannerText: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  miniBogoNote: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 8 },
  miniBogoText: { color: colors.muted, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  entriesSection: { marginTop: 22 },
  entriesSub: { color: colors.muted, fontSize: 12.5, fontWeight: "600", marginTop: -8, marginBottom: 8 },
  entriesScroll: { maxHeight: 240, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 12 },
  entRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  entSeat: { color: colors.muted, fontSize: 12, fontWeight: "800", width: 34 },
  entName: { color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 },
  entNameMine: { color: colors.red, fontWeight: "800" },
  entNameOpen: { color: colors.muted, fontWeight: "500" },
  entPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  entPillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },
  miniSection: { marginTop: 18 },
  miniHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  miniAdd: { color: colors.red, fontSize: 14, fontWeight: "800" },
  miniAddBtn: { backgroundColor: colors.red, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  miniAddBtnText: { color: colors.onAccent, fontSize: 13, fontWeight: "800" },
  miniRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 10, marginTop: 10 },
  miniThumb: { width: 60, height: 60, borderRadius: 10 },
  miniRowTitle: { color: colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.2 },
  miniRowMeta: { color: colors.muted, fontSize: 12, marginTop: 2, textTransform: "capitalize" },
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
  soonOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  soonEyebrow: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  soonCountdown: { color: "#fff", fontSize: 40, fontWeight: "900", marginTop: 4, letterSpacing: -0.5 },
  soonWhen: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "600", marginTop: 4 },
  draftBanner: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  draftBannerText: { color: colors.text, fontSize: 13, flex: 1, lineHeight: 18 },
  draftPublish: { backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  draftPublishText: { color: colors.onAccent, fontWeight: "800", fontSize: 13 },
  notifyBtn: { backgroundColor: colors.surface, borderColor: colors.red, borderWidth: 1, borderRadius: radius.md, paddingVertical: 13, alignItems: "center", marginBottom: 14 },
  notifyOn: { backgroundColor: colors.redSoft },
  notifyText: { color: colors.red, fontWeight: "800", fontSize: 14 },
  notifyTextOn: { color: colors.text },
  featNote: { color: colors.faint, fontSize: 12, textAlign: "center", marginTop: -4 },
  bogoNote: { color: colors.green, fontSize: 13, fontWeight: "700", lineHeight: 18, backgroundColor: colors.greenSoft, borderRadius: radius.md, padding: 12 },
  pad: { padding: 20 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  prize: { color: colors.muted, fontSize: 16, marginTop: 6 },
  prizeBold: { color: colors.text, fontSize: 18, fontWeight: "800", letterSpacing: -0.2, marginTop: 8 },
  priceTop: { color: colors.red, fontSize: 18, fontWeight: "900", marginTop: 4 },
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
  boardScroll: { maxHeight: 260, marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  qtyBox: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, marginTop: 6, alignItems: "center" },
  qtyLabel: { color: colors.muted, fontSize: 13, fontWeight: "700", marginBottom: 10 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 14 },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  qtyBtnText: { color: colors.text, fontSize: 24, fontWeight: "800" },
  qtyVal: { color: colors.text, fontSize: 28, fontWeight: "900", minWidth: 48, textAlign: "center" },
  board: { flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 10 },
  seat: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  seatOpen: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  seatFree: { backgroundColor: colors.greenSoft, borderWidth: 1, borderColor: colors.green },
  seatNumFree: { color: colors.green },
  seatFree: { backgroundColor: colors.greenSoft },
  seatPaid: { backgroundColor: colors.redSoft },
  seatNum: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  seatNumClaimed: { color: colors.text },
  bigNote: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  canceledNote: { color: colors.red, textAlign: "center", fontWeight: "700", marginTop: 4 },
  cancelHint: { color: colors.muted, fontSize: 12.5, lineHeight: 18, fontWeight: "600", marginTop: -4 },
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
