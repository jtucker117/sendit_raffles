import { useCallback, useMemo, useState } from "react";
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
const CATEGORIES = ["All", "Firearms", "Cash", "Optics", "Gear", "Charity", "Ending soon"];

interface RaffleRow {
  id: string; title: string; prize: string | null; cover_url: string | null;
  capacity: number; entry_word: string; amount_cents: number;
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
  const [cat, setCat] = useState("All");

  const loadRaffles = useCallback(async () => {
    if (!user) return;
    setLoadingRaffles(true);
    const { data } = await supabase.from("raffles").select("*").eq("status", "open").order("created_at", { ascending: false });
    const rows = (data ?? []) as RaffleRow[];
    setRaffles(rows);
    // Tally claimed seats per raffle for the sold bars.
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: tix } = await supabase.from("tickets").select("raffle_id").in("raffle_id", ids);
      const tally: Record<string, number> = {};
      (tix ?? []).forEach((t: any) => { tally[t.raffle_id] = (tally[t.raffle_id] ?? 0) + 1; });
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

  const money = (c: number) => `$${(c / 100).toFixed(0)}`;
  const isHost = user.role === "host";
  const claimedOf = (r: RaffleRow) => counts[r.id] ?? 0;
  const soldPct = (r: RaffleRow) => Math.min(100, Math.round((claimedOf(r) / Math.max(r.capacity, 1)) * 100));

  // Featured = most-sold open raffle; rest go in the grid.
  const sorted = [...raffles].sort((a, b) => soldPct(b) - soldPct(a));
  const featured = sorted[0];
  const cols = width >= 900 ? 3 : width >= 600 ? 2 : 1;
  const contentW = Math.min(width, 1100) - 32;
  const gap = 14;
  const cardW = cols === 1 ? contentW : (contentW - gap * (cols - 1)) / cols;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
        refreshControl={<RefreshControl refreshing={loadingRaffles} onRefresh={loadRaffles} tintColor={colors.red} />}
      >
        {/* Search + host action */}
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <Text style={styles.searchPlaceholder}>Search raffles, prizes, hosts…</Text>
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
            <Text style={styles.bannerText}>⏳ Your host account is pending approval. You can browse, but can’t create raffles yet.</Text>
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
                <Text style={styles.emptyText}>No raffles yet</Text>
                <Text style={styles.emptyHint}>
                  {isHost ? "Create your first raffle — add a cover photo and it’ll be featured up top." : "Follow a host with their code to see their raffles."}
                </Text>
                <TouchableOpacity style={styles.followBtn} onPress={() => router.push(isHost ? "/host/create-raffle" : "/join")}>
                  <Text style={styles.followText}>{isHost ? "+ Create raffle" : "Follow a host"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Featured hero */}
            {featured && (
              <TouchableOpacity activeOpacity={0.9} style={styles.hero} onPress={() => router.push(`/raffle/${featured.id}`)}>
                {featured.cover_url
                  ? <Image source={{ uri: featured.cover_url }} style={styles.heroImg} />
                  : <LinearGradient colors={[colors.navy, colors.bg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroImg} />}
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.75)"]} style={styles.heroShade} />
                <View style={styles.heroInfo}>
                  <View style={styles.pillLive}><Text style={styles.pillLiveText}>● OPEN</Text></View>
                  <Text style={styles.heroTitle} numberOfLines={2}>{featured.title}</Text>
                  <View style={styles.heroMeta}>
                    <View style={styles.heroChip}><Text style={styles.heroChipText}>Enter · {money(featured.amount_cents)}</Text></View>
                    <View style={styles.heroChipSoft}><Text style={styles.heroChipSoftText}>{claimedOf(featured)} entrants</Text></View>
                    <View style={styles.heroChipSoft}><Text style={styles.heroChipSoftText}>{soldPct(featured)}% sold</Text></View>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {/* Grid */}
            <Text style={styles.sectionTitle}>{isHost ? "Open raffles" : "Raffles from hosts you follow"}</Text>
            <View style={styles.grid}>
              {raffles.map((r) => (
                <TouchableOpacity key={r.id} activeOpacity={0.9} style={[styles.card, { width: cardW }]} onPress={() => router.push(`/raffle/${r.id}`)}>
                  {r.cover_url
                    ? <Image source={{ uri: r.cover_url }} style={styles.cardImg} />
                    : <LinearGradient colors={[colors.surfaceAlt, colors.border]} style={styles.cardImg} />}
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{r.title}</Text>
                    {r.prize ? <Text style={styles.cardSub} numberOfLines={1}>🏆 {r.prize}</Text> : <Text style={styles.cardSub}>{r.capacity} seats</Text>}
                    <View style={styles.bar}><View style={[styles.barFill, { width: `${soldPct(r)}%` }]} /></View>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardPrice}>{money(r.amount_cents)} / seat</Text>
                      <Text style={styles.cardLeft}>{Math.max(r.capacity - claimedOf(r), 0)} left</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
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
  heroImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  heroShade: { ...StyleSheet.absoluteFillObject },
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
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cardImg: { width: "100%", aspectRatio: 4 / 5 },
  cardBody: { padding: 12 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cardSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginTop: 10, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.red },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 9 },
  cardPrice: { color: colors.text, fontSize: 12, fontWeight: "800" },
  cardLeft: { color: colors.muted, fontSize: 12, fontWeight: "600" },

  empty: { alignItems: "center", marginTop: 40, gap: 8 },
  emptyCard: { alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 40, paddingHorizontal: 24, marginTop: 8 },
  emptyLogo: { width: 96, height: 96, marginBottom: 4 },
  emptyText: { color: colors.text, fontSize: 18, fontWeight: "800" },
  emptyHint: { color: colors.muted, fontSize: 13, textAlign: "center", maxWidth: 280 },
  followBtn: { marginTop: 12, backgroundColor: colors.red, paddingVertical: 12, paddingHorizontal: 22, borderRadius: radius.md },
  followText: { color: colors.onAccent, fontWeight: "700" },
});
