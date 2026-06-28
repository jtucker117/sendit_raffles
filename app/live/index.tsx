import { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, RefreshControl, useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";
import { GameCard } from "@/components/GameCard";

interface Row {
  id: string; title: string; prize: string | null; cover_url: string | null;
  capacity: number; amount_cents: number; status: string; sold: number; winner?: string;
}
type Filter = "all" | "soon" | "drawn";

export default function Live() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: raffles } = await supabase
      .from("raffles").select("*").in("status", ["open", "complete"]).order("created_at", { ascending: false });
    const rs = (raffles ?? []) as any[];
    const ids = rs.map((r) => r.id);

    const soldMap: Record<string, number> = {};
    if (ids.length) {
      const { data: tix } = await supabase.from("tickets").select("raffle_id").in("raffle_id", ids);
      (tix ?? []).forEach((t: any) => { soldMap[t.raffle_id] = (soldMap[t.raffle_id] ?? 0) + 1; });
    }
    const { data: draws } = await supabase.from("draws").select("raffle_id, winner_id");
    const winnerIds = [...new Set((draws ?? []).map((d: any) => d.winner_id))];
    const nameMap: Record<string, string> = {};
    if (winnerIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", winnerIds);
      (profs ?? []).forEach((p: any) => { nameMap[p.id] = p.display_name; });
    }
    const winnerByRaffle: Record<string, string> = {};
    (draws ?? []).forEach((d: any) => { winnerByRaffle[d.raffle_id] = nameMap[d.winner_id] ?? "Winner"; });

    setRows(rs.map((r) => ({
      id: r.id, title: r.title, prize: r.prize, cover_url: r.cover_url, capacity: r.capacity,
      amount_cents: r.amount_cents, status: r.status, sold: soldMap[r.id] ?? 0, winner: winnerByRaffle[r.id],
    })).sort((a, b) => (b.status === "open" ? 1 : 0) - (a.status === "open" ? 1 : 0)));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isSoon = (r: Row) => r.status === "open" && r.sold >= r.capacity; // sold out, awaiting the host's draw
  const visible = rows.filter((r) =>
    filter === "soon" ? isSoon(r) : filter === "drawn" ? r.status === "complete" : (isSoon(r) || r.status === "complete"),
  );
  const liveCount = rows.filter(isSoon).length;

  const cols = width >= 1100 ? 4 : width >= 760 ? 3 : 2;
  const contentW = Math.min(width, 1100) - 40;
  const gap = 14;
  const cardW = (contentW - gap * (cols - 1)) / cols;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.red} />}
      >
        <View style={styles.titleRow}>
          {liveCount > 0 && <View style={styles.dot} />}
          <Text style={styles.h1}>Live & results</Text>
        </View>
        <Text style={styles.sub}>Games that are sold out and about to draw, plus recent winners. Browse open games on the Browse tab.</Text>

        {/* Filter */}
        <View style={styles.tabs}>
          {([["all", "All"], ["soon", "Drawing soon"], ["drawn", "Results"]] as [Filter, string][]).map(([k, label]) => (
            <TouchableOpacity key={k} style={[styles.tab, filter === k && styles.tabActive]} onPress={() => setFilter(k)}>
              <Text style={[styles.tabText, filter === k && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.red} style={{ marginTop: 40 }} />
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>{filter === "soon" ? "Nothing sold out and ready to draw right now." : filter === "drawn" ? "No results yet." : "No live action yet — check back when games sell out."}</Text>
        ) : (
          <View style={styles.grid}>
            {visible.map((r) => {
              const drawn = r.status === "complete";
              return (
                <GameCard
                  key={r.id}
                  data={{ id: r.id, title: r.title, cover_url: r.cover_url, amount_cents: r.amount_cents, capacity: r.capacity, claimed: r.sold }}
                  width={cardW}
                  onPress={() => router.push(drawn ? `/r/${r.id}` : `/raffle/${r.id}`)}
                  badge={drawn ? "DRAWN" : "● READY"}
                  footLeft={drawn ? `🏆 ${r.winner ?? "Winner"}` : "Sold out"}
                  footRight={drawn ? "Result" : "Drawing soon"}
                />
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red },
  h1: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.4 },
  sub: { color: colors.muted, fontSize: 13, marginBottom: 16, lineHeight: 18 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 18 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabActive: { backgroundColor: colors.redSoft, borderColor: colors.red },
  tabText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: colors.text },
  empty: { color: colors.muted, fontSize: 14, marginTop: 30, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  coverWrap: { position: "relative" },
  cover: { width: "100%", aspectRatio: 4 / 5 },
  badge: { position: "absolute", top: 8, left: 8, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  badgeLive: { backgroundColor: colors.red },
  badgeDrawn: { backgroundColor: "rgba(0,0,0,0.65)" },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  body: { padding: 12 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cardMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginTop: 9, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.red },
});
