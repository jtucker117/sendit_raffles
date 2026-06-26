import { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, RefreshControl, useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme-context";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

const CATEGORIES = ["All", "PEWS", "Cash", "Optics", "Gear", "Charity"];

interface RaffleRow {
  id: string; title: string; prize: string | null; cover_url: string | null;
  capacity: number; entry_word: string; amount_cents: number; status: string; category?: string | null;
}

export default function BrowseRafflesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();

  const [raffles, setRaffles] = useState<RaffleRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("All");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("raffles").select("*").eq("status", "open").order("created_at", { ascending: false });
    const rows = (data ?? []) as RaffleRow[];
    setRaffles(rows);
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: tix } = await supabase.from("tickets").select("raffle_id").in("raffle_id", ids);
      const tally: Record<string, number> = {};
      (tix ?? []).forEach((t: any) => { tally[t.raffle_id] = (tally[t.raffle_id] ?? 0) + 1; });
      setCounts(tally);
    } else setCounts({});
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const money = (c: number) => `$${(c / 100).toFixed(0)}`;
  const claimedOf = (r: RaffleRow) => counts[r.id] ?? 0;
  const soldPct = (r: RaffleRow) => Math.min(100, Math.round((claimedOf(r) / Math.max(r.capacity, 1)) * 100));

  const cols = width >= 900 ? 3 : width >= 600 ? 2 : 1;
  const contentW = Math.min(width, 1100) - 40;
  const gap = 14;
  const cardW = cols === 1 ? contentW : (contentW - gap * (cols - 1)) / cols;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.red} />}
      >
        <Text style={styles.h1}>Games</Text>
        <Text style={styles.sub}>From hosts you follow</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity key={c} style={[styles.chip, cat === c && styles.chipActive]} onPress={() => setCat(c)}>
              <Text style={[styles.chipText, cat === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={colors.red} style={{ marginTop: 30 }} />
        ) : raffles.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No games yet.</Text>
            <Text style={styles.emptyHint}>Follow a host with their code to see their games.</Text>
            <TouchableOpacity style={styles.followBtn} onPress={() => router.push("/join")}>
              <Text style={styles.followText}>Follow a host</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.grid}>
            {(cat === "All" ? raffles : raffles.filter((r) => r.category === cat)).map((r) => (
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
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.4 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 16 },
  chips: { gap: 8, paddingBottom: 4, marginBottom: 16 },
  chip: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  chipActive: { backgroundColor: colors.red, borderColor: colors.red },
  chipText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: colors.onAccent },
  empty: { alignItems: "center", marginTop: 40, gap: 8 },
  emptyText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  emptyHint: { color: colors.muted, fontSize: 13, textAlign: "center", maxWidth: 280 },
  followBtn: { marginTop: 12, backgroundColor: colors.red, paddingVertical: 12, paddingHorizontal: 22, borderRadius: radius.md },
  followText: { color: colors.onAccent, fontWeight: "700" },
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
});
