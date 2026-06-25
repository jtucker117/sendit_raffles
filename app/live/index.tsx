import { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

interface Row {
  id: string; title: string; prize: string | null; cover_url: string | null;
  capacity: number; amount_cents: number; status: string; sold: number; winner?: string;
}

export default function Live() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [live, setLive] = useState<Row[]>([]);
  const [recent, setRecent] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: raffles } = await supabase
      .from("raffles").select("*").in("status", ["open", "complete"]).order("created_at", { ascending: false });
    const rows = (raffles ?? []) as any[];
    const ids = rows.map((r) => r.id);

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

    const mapped: Row[] = rows.map((r) => ({
      id: r.id, title: r.title, prize: r.prize, cover_url: r.cover_url,
      capacity: r.capacity, amount_cents: r.amount_cents, status: r.status,
      sold: soldMap[r.id] ?? 0, winner: winnerByRaffle[r.id],
    }));
    setLive(mapped.filter((r) => r.status === "open").sort((a, b) => (b.sold / b.capacity) - (a.sold / a.capacity)));
    setRecent(mapped.filter((r) => r.status === "complete"));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pct = (r: Row) => Math.min(100, Math.round((r.sold / Math.max(r.capacity, 1)) * 100));

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.red} />}
      >
        <View style={styles.titleRow}>
          <View style={styles.dot} />
          <Text style={styles.h1}>Live now</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.red} style={{ marginTop: 40 }} />
        ) : (
          <>
            {live.length === 0 ? (
              <Text style={styles.empty}>No live raffles right now.</Text>
            ) : (
              live.map((r) => (
                <TouchableOpacity key={r.id} activeOpacity={0.9} style={styles.row} onPress={() => router.push(`/raffle/${r.id}`)}>
                  {r.cover_url
                    ? <Image source={{ uri: r.cover_url }} style={styles.thumb} />
                    : <LinearGradient colors={[colors.surfaceAlt, colors.border]} style={styles.thumb} />}
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{r.title}</Text>
                    <Text style={styles.rowMeta}>{r.sold} entrants · {pct(r)}% sold</Text>
                    <View style={styles.bar}><View style={[styles.barFill, { width: `${pct(r)}%` }]} /></View>
                  </View>
                  <View style={styles.liveTag}><Text style={styles.liveTagText}>LIVE</Text></View>
                </TouchableOpacity>
              ))
            )}

            {recent.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Recently drawn</Text>
                {recent.map((r) => (
                  <TouchableOpacity key={r.id} activeOpacity={0.9} style={styles.row} onPress={() => router.push(`/raffle/${r.id}`)}>
                    {r.cover_url
                      ? <Image source={{ uri: r.cover_url }} style={styles.thumb} />
                      : <LinearGradient colors={[colors.surfaceAlt, colors.border]} style={styles.thumb} />}
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{r.title}</Text>
                      <Text style={styles.rowMeta}>🏆 Winner: {r.winner ?? "—"}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 18 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red },
  h1: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.4 },
  empty: { color: colors.muted, fontSize: 14, marginTop: 8 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 24, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 12 },
  thumb: { width: 80, height: 80 },
  rowBody: { flex: 1, padding: 12 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginTop: 8, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.red },
  liveTag: { backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginRight: 12 },
  liveTagText: { color: colors.onAccent, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
});
