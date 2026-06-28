import { useCallback, useMemo, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView,
  Image, RefreshControl, useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

const LOGO = require("../assets/logo.png");
const CATEGORIES = ["All", "PEWS", "Cash", "Optics", "Gear", "Charity"];

interface RaffleRow {
  id: string; title: string; prize: string | null; cover_url: string | null;
  capacity: number; entry_word: string; amount_cents: number; category?: string | null;
  status?: string; scheduled_at?: string | null;
}

export default function Home() {
  const { user, loading, isHostApproved, isHostPending, isSuperadmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [raffles, setRaffles] = useState<RaffleRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingRaffles, setLoadingRaffles] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 1000); return () => clearInterval(t); }, []);
  const fmtCountdown = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${ss}s` : `${m}m ${ss}s`;
  };
  const [cat, setCat] = useState("All");

  const loadRaffles = useCallback(async () => {
    if (!user) return;
    setLoadingRaffles(true);
    // Flip any scheduled games whose time has arrived to open before we load.
    await supabase.rpc("open_due_games");
    const { data } = await supabase.from("raffles").select("*").in("status", ["open", "scheduled"]).order("created_at", { ascending: false });
    const rows = (data ?? []) as RaffleRow[];
    setRaffles(rows);
    // Tally claimed seats per raffle for the sold bars.
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: tix } = await supabase.from("tickets").select("raffle_id, type").in("raffle_id", ids);
      const tally: Record<string, number> = {};
      // Count paid seats only — free/BOGO seats live above capacity and shouldn't
      // make a game look full while paid seats remain.
      (tix ?? []).forEach((t: any) => { if (t.type === "paid") tally[t.raffle_id] = (tally[t.raffle_id] ?? 0) + 1; });
      setCounts(tally);
    } else setCounts({});
    setLoadingRaffles(false);
  }, [user]);

  useFocusEffect(useCallback(() => { loadRaffles(); }, [loadRaffles]));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.red} /></View>;
  }
  if (!user) {
    return (
      <View style={styles.center}>
        <Image source={LOGO} style={styles.bigLogo} resizeMode="contain" />
        <Text style={styles.tag}>Real People. Real Prizes.</Text>
      </View>
    );
  }

  const money = (c: number) => `$${c % 100 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;
  const isHost = user.role === "host";
  const claimedOf = (r: RaffleRow) => counts[r.id] ?? 0;
  const soldPct = (r: RaffleRow) => Math.min(100, Math.round((claimedOf(r) / Math.max(r.capacity, 1)) * 100));

  // Featured = paid featured open games (never scheduled/draft). They also still
  // appear in the Open games grid below.
  const filtered = cat === "All" ? raffles : raffles.filter((r) => r.category === cat);
  const featuredPool = filtered.filter((r) => (r as any).featured && r.status === "open");
  const cols = width >= 1100 ? 4 : width >= 760 ? 3 : 2;
  const contentW = Math.min(width, 1100) - 32;
  const gap = 14;
  const cardW = cols === 1 ? contentW : (contentW - gap * (cols - 1)) / cols;

  // Shared 4:5 game tile (used by both Featured and Open games).
  const renderTile = (r: RaffleRow, isFeatured: boolean) => {
    const upcoming = r.status === "scheduled" && !!r.scheduled_at && new Date(r.scheduled_at).getTime() > nowMs;
    return (
      <TouchableOpacity key={(isFeatured ? "f" : "g") + r.id} activeOpacity={0.9} style={[styles.card, { width: cardW }]} onPress={() => router.push(`/raffle/${r.id}`)}>
        {r.cover_url
          ? <Image source={{ uri: r.cover_url }} style={styles.cardImg} blurRadius={upcoming ? 12 : 0} />
          : <LinearGradient colors={[colors.surfaceAlt, colors.border]} style={styles.cardImg} />}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.82)"]} style={styles.cardShade} />
        {isFeatured && <View style={styles.tileFeatured}><Text style={styles.tileFeaturedText}>⭐ FEATURED</Text></View>}
        {(() => {
          const t = (r as any).bogo ? "🎁 BOGO" : (r as any).free_for_all ? "🎁 FREE SEAT" : (r as any).no_seats ? "🎟 ENTRIES" : null;
          return t ? <View style={styles.tileType}><Text style={styles.tileTypeText}>{t}</Text></View> : null;
        })()}
        {upcoming && (
          <View style={styles.soonFull}>
            <Text style={styles.soonFullEyebrow}>🔒 COMING SOON</Text>
            <Text style={styles.soonFullCount}>{fmtCountdown(new Date(r.scheduled_at!).getTime() - nowMs)}</Text>
            <Text style={styles.soonFullWhen}>{new Date(r.scheduled_at!).toLocaleDateString()}</Text>
          </View>
        )}
        {!upcoming && r.capacity > 0 && claimedOf(r) >= r.capacity && (
          <View style={styles.fullStamp} pointerEvents="none"><Text style={styles.fullStampText}>FULL</Text></View>
        )}
        <View style={styles.cardFooter}>
          <Text style={styles.cardTitle} numberOfLines={1}>{r.title}</Text>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${soldPct(r)}%` }]} /></View>
          <View style={styles.cardRow}>
            <Text style={styles.cardPrice}>{money(r.amount_cents)}</Text>
            <Text style={styles.cardLeft}>{upcoming ? "Coming soon" : `${Math.max(r.capacity - claimedOf(r), 0)} left`}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
        refreshControl={<RefreshControl refreshing={loadingRaffles} onRefresh={loadRaffles} tintColor={colors.red} />}
      >
        {/* Search + host action */}
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <Text style={styles.searchPlaceholder}>Search games, prizes, hosts…</Text>
          </View>
          {isHost && isHostApproved && (
            <TouchableOpacity style={styles.hostBtn} onPress={() => router.push("/host/create-raffle")}>
              <Text style={styles.hostBtnText}>+ Host</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Host approval banner */}
        {isHost && isHostPending && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>⏳ Your host account is pending approval. You can browse, but can’t create games yet.</Text>
          </View>
        )}

        {loadingRaffles ? (
          <ActivityIndicator color={colors.red} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Category chips (always visible — marketplace feel) */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity key={c} style={[styles.chip, cat === c && styles.chipActive]} onPress={() => setCat(c)}>
                  <Text style={[styles.chipText, cat === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {raffles.length === 0 ? (
              <View style={styles.emptyCard}>
                <Image source={LOGO} style={styles.emptyLogo} resizeMode="contain" />
                <Text style={styles.emptyText}>No games yet</Text>
                <Text style={styles.emptyHint}>
                  {isHost ? "Create your first game — add a cover photo and it’ll be featured up top." : "Follow a host with their code to see their games."}
                </Text>
                <TouchableOpacity style={styles.followBtn} onPress={() => router.push(isHost ? "/host/create-raffle" : "/join")}>
                  <Text style={styles.followText}>{isHost ? "+ Create game" : "Follow a host"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Featured — 4:5 cards (also still shown in Open games below) */}
                {featuredPool.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>⭐ Featured</Text>
                    <View style={styles.grid}>{featuredPool.map((r) => renderTile(r, true))}</View>
                  </>
                )}

                {/* Open games — all games, newest first */}
                <Text style={styles.sectionTitle}>{isHost ? "Open games" : "Games from hosts you follow"}</Text>
                <View style={styles.grid}>{filtered.map((r) => renderTile(r, false))}</View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 8 },
  bigLogo: { width: 200, height: 200 },
  tag: { color: colors.muted, fontSize: 15 },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  search: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 12 },
  searchPlaceholder: { color: colors.muted, fontSize: 14 },
  hostBtn: { backgroundColor: colors.red, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12 },
  hostBtnText: { color: colors.onAccent, fontWeight: "800", fontSize: 14 },

  banner: { backgroundColor: colors.amberSoft, borderColor: colors.amber, borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 16 },
  bannerText: { color: colors.text, fontSize: 13, lineHeight: 18 },

  hero: { borderRadius: radius.lg, overflow: "hidden", height: 220, marginBottom: 16, backgroundColor: colors.surface },
  heroBlur: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  heroImg: { position: "absolute", top: 10, left: 10, right: 10, bottom: 56 },
  heroShade: { ...StyleSheet.absoluteFillObject },
  featuredTag: { position: "absolute", top: 12, left: 12, backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 5 },
  featuredTagText: { color: colors.onAccent, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  heroInfo: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 18 },
  pillLive: { alignSelf: "flex-start", backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  pillLiveText: { color: colors.onAccent, fontSize: 12, fontWeight: "800" },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 10, letterSpacing: -0.4 },
  heroMeta: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  heroChip: { backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  heroChipText: { color: colors.onAccent, fontWeight: "800", fontSize: 13 },
  heroChipSoft: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  heroChipSoftText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  chips: { gap: 8, paddingBottom: 4, marginBottom: 14 },
  chip: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  chipActive: { backgroundColor: colors.red, borderColor: colors.red },
  chipText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: colors.onAccent },

  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden", aspectRatio: 4 / 5 },
  cardImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  cardShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "55%" },
  tileFeatured: { position: "absolute", top: 8, left: 8, backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4, zIndex: 2 },
  tileFeaturedText: { color: colors.onAccent, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  tileType: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4, zIndex: 2 },
  tileTypeText: { color: "#fff", fontSize: 9.5, fontWeight: "900", letterSpacing: 0.5 },
  soonFull: { position: "absolute", left: 0, right: 0, top: 0, bottom: 36, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  soonFullEyebrow: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  soonFullCount: { color: "#fff", fontSize: 26, fontWeight: "900", marginTop: 4, letterSpacing: -0.5, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 },
  soonFullWhen: { color: "rgba(255,255,255,0.92)", fontSize: 12, fontWeight: "600", marginTop: 2 },
  fullStamp: { position: "absolute", top: "38%", left: -8, right: -8, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-13deg" }], zIndex: 4 },
  fullStampText: { color: "#FF2A2A", fontSize: 38, fontWeight: "900", letterSpacing: 5, borderWidth: 4, borderColor: "#FF2A2A", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 2, backgroundColor: "rgba(255,42,42,0.12)", textShadowColor: "rgba(0,0,0,0.55)", textShadowRadius: 5, overflow: "hidden" },
  cardFooter: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 9, paddingBottom: 9, paddingTop: 4 },
  cardTitle: { color: "#fff", fontSize: 13, fontWeight: "800" },
  bar: { height: 4, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.28)", marginTop: 6, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.red },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  cardPrice: { color: "#fff", fontSize: 12, fontWeight: "800" },
  cardLeft: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "600" },

  empty: { alignItems: "center", marginTop: 40, gap: 8 },
  emptyCard: { alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 40, paddingHorizontal: 24, marginTop: 8 },
  emptyLogo: { width: 96, height: 96, marginBottom: 4 },
  emptyText: { color: colors.text, fontSize: 18, fontWeight: "800" },
  emptyHint: { color: colors.muted, fontSize: 13, textAlign: "center", maxWidth: 280 },
  followBtn: { marginTop: 12, backgroundColor: colors.red, paddingVertical: 12, paddingHorizontal: 22, borderRadius: radius.md },
  followText: { color: colors.onAccent, fontWeight: "700" },
});
