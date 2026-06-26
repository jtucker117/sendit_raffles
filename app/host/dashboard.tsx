import { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, RefreshControl, useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

interface Row {
  id: string; title: string; cover_url: string | null; capacity: number; amount_cents: number; status: string;
  claimed: number; confirmed: number; paidConfirmed: number;
}

export default function HostDashboard() {
  const { user, isHostApproved } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cols = width >= 900 ? 3 : 2;
  const contentW = Math.min(width, 1100) - 40;
  const gap = 14;
  const cardW = (contentW - gap * (cols - 1)) / cols;

  const [rows, setRows] = useState<Row[]>([]);
  const [topPlayers, setTopPlayers] = useState<{ id: string; name: string; seats: number; spent: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data: raffles } = await supabase.from("raffles").select("id, title, cover_url, capacity, amount_cents, status").eq("host_id", user.id).order("created_at", { ascending: false });
    const rs = (raffles ?? []) as any[];
    const ids = rs.map((r) => r.id);
    const amountByRaffle: Record<string, number> = {};
    rs.forEach((r) => { amountByRaffle[r.id] = r.amount_cents; });

    const tally: Record<string, { claimed: number; confirmed: number; paidConfirmed: number }> = {};
    const ownerAgg: Record<string, { seats: number; spent: number }> = {};
    if (ids.length) {
      const { data: tix } = await supabase.from("tickets").select("raffle_id, owner_id, type, status").in("raffle_id", ids);
      (tix ?? []).forEach((t: any) => {
        const e = tally[t.raffle_id] ?? (tally[t.raffle_id] = { claimed: 0, confirmed: 0, paidConfirmed: 0 });
        e.claimed++;
        if (t.status === "confirmed") {
          e.confirmed++;
          if (t.type === "paid") e.paidConfirmed++;
          const o = ownerAgg[t.owner_id] ?? (ownerAgg[t.owner_id] = { seats: 0, spent: 0 });
          o.seats++;
          if (t.type === "paid") o.spent += amountByRaffle[t.raffle_id] ?? 0;
        }
      });
    }
    setRows(rs.map((r) => ({
      id: r.id, title: r.title, cover_url: r.cover_url, capacity: r.capacity, amount_cents: r.amount_cents, status: r.status,
      claimed: tally[r.id]?.claimed ?? 0, confirmed: tally[r.id]?.confirmed ?? 0, paidConfirmed: tally[r.id]?.paidConfirmed ?? 0,
    })));

    // Top 3 players in this host's community by spend (then seats)
    const top = Object.entries(ownerAgg)
      .sort((a, b) => (b[1].spent - a[1].spent) || (b[1].seats - a[1].seats))
      .slice(0, 3);
    const topIds = top.map(([oid]) => oid);
    const names: Record<string, string> = {};
    if (topIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", topIds);
      (profs ?? []).forEach((p: any) => { names[p.id] = p.display_name; });
    }
    setTopPlayers(top.map(([oid, v]) => ({ id: oid, name: names[oid] ?? "Player", seats: v.seats, spent: v.spent })));
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const money = (c: number) => `$${(c / 100).toFixed(0)}`;
  const liveCount = rows.filter((r) => r.status === "open").length;
  const revenueCents = rows.reduce((sum, r) => sum + r.paidConfirmed * r.amount_cents, 0);
  const entrants = rows.reduce((sum, r) => sum + r.confirmed, 0);
  const pct = (r: Row) => Math.min(100, Math.round((r.claimed / Math.max(r.capacity, 1)) * 100));
  const statusChip = (s: string) => (s === "open" ? "● LIVE" : s === "complete" ? "DRAWN" : "CANCELED");

  if (!isHostApproved) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Only approved hosts have a dashboard.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.red} />}
      >
        <Text style={styles.h1}>Your raffles</Text>

        {/* Stat row */}
        <View style={styles.stats}>
          <View style={styles.statBox}><Text style={[styles.statVal, { color: colors.red }]}>{liveCount}</Text><Text style={styles.statLabel}>Live</Text></View>
          <View style={styles.statBox}><Text style={styles.statVal}>{money(revenueCents)}</Text><Text style={styles.statLabel}>Revenue</Text></View>
          <View style={styles.statBox}><Text style={styles.statVal}>{entrants}</Text><Text style={styles.statLabel}>Entrants</Text></View>
        </View>

        {/* Top players in your community */}
        {topPlayers.length > 0 && (
          <View style={styles.topCard}>
            <Text style={styles.topTitle}>Top players</Text>
            {topPlayers.map((p, i) => (
              <TouchableOpacity key={p.id} style={styles.topRow} activeOpacity={0.8} onPress={() => router.push(`/u/${p.id}`)}>
                <Text style={styles.rank}>{["🥇", "🥈", "🥉"][i] ?? `${i + 1}`}</Text>
                <Text style={styles.topName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.topMeta}>{p.seats} seat{p.seats === 1 ? "" : "s"} · {money(p.spent)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.newBtn} onPress={() => router.push("/host/create-raffle")}>
          <Text style={styles.newBtnText}>+ New raffle</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color={colors.red} style={{ marginTop: 30 }} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No raffles yet — create your first one.</Text>
        ) : (
          <View style={styles.grid}>
            {rows.map((r) => (
              <View key={r.id} style={[styles.card, { width: cardW }]}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => router.push(`/raffle/${r.id}`)}>
                  <View style={styles.coverWrap}>
                    {r.cover_url ? <Image source={{ uri: r.cover_url }} style={styles.cover} /> : <LinearGradient colors={[colors.navy, colors.bg]} style={styles.cover} />}
                    <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} style={StyleSheet.absoluteFill} />
                    <View style={[styles.chip, r.status === "open" ? styles.chipLive : r.status === "complete" ? styles.chipDrawn : styles.chipCanceled]}>
                      <Text style={styles.chipText}>{statusChip(r.status)}</Text>
                    </View>
                    <View style={styles.overlay}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{r.title}</Text>
                      <Text style={styles.cardMeta}>{r.claimed}/{r.capacity} · {money(r.paidConfirmed * r.amount_cents)}</Text>
                      <View style={styles.bar}><View style={[styles.barFill, { width: `${pct(r)}%` }]} /></View>
                    </View>
                  </View>
                </TouchableOpacity>
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionGhost]} onPress={() => router.push(`/raffle/manage/${r.id}`)}>
                    <Text style={[styles.actionText, { color: colors.text }]} numberOfLines={1}>Manage</Text>
                  </TouchableOpacity>
                  {r.status === "open" && (
                    <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary, r.confirmed < 1 && styles.dim]} disabled={r.confirmed < 1} onPress={() => router.push(`/raffle/${r.id}`)}>
                      <Text style={[styles.actionText, { color: colors.onAccent }]} numberOfLines={1}>{r.confirmed < 1 ? "Draw" : "Draw"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12, padding: 24 },
  muted: { color: colors.muted, textAlign: "center" },
  h1: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.4, marginBottom: 16 },
  stats: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingVertical: 16, alignItems: "center" },
  statVal: { color: colors.text, fontSize: 22, fontWeight: "900" },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  topCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 14, marginBottom: 16 },
  topTitle: { color: colors.text, fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  rank: { fontSize: 16, width: 24, textAlign: "center" },
  topName: { color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 },
  topMeta: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  newBtn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 13, alignItems: "center", marginBottom: 18 },
  newBtnText: { color: colors.onAccent, fontWeight: "800", fontSize: 15 },
  empty: { color: colors.muted, fontSize: 14, marginTop: 24, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  coverWrap: { width: "100%", aspectRatio: 4 / 5, position: "relative", backgroundColor: colors.surfaceAlt },
  cover: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  chip: { position: "absolute", top: 8, right: 8, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  chipLive: { backgroundColor: colors.red },
  chipDrawn: { backgroundColor: "rgba(0,0,0,0.6)" },
  chipCanceled: { backgroundColor: "rgba(0,0,0,0.6)" },
  chipText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  overlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 10 },
  cardTitle: { color: "#fff", fontSize: 15, fontWeight: "900" },
  cardMeta: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 3 },
  bar: { height: 5, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.25)", marginTop: 8, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.red },
  actions: { flexDirection: "row", gap: 8, padding: 10 },
  actionBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.md, alignItems: "center" },
  actionGhost: { borderWidth: 1, borderColor: colors.border },
  actionPrimary: { backgroundColor: colors.red },
  actionText: { fontWeight: "800", fontSize: 13 },
  dim: { opacity: 0.45 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
