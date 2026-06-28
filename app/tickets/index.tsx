import { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, useWindowDimensions,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";
import { GameCard } from "@/components/GameCard";

interface Entry {
  raffleId: string;
  title: string;
  prize: string | null;
  cover_url: string | null;
  capacity: number;
  amount_cents: number;
  status: string;
  seats: number[];
  sold: number;
  won: boolean;
  noSeats: boolean;
}

type Tab = "all" | "active" | "won" | "past";

export default function MyTickets() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cols = width >= 1100 ? 4 : width >= 760 ? 3 : 2;
  const gap = 14;
  const contentW = Math.min(width, 1100) - 40;
  const cardW = (contentW - gap * (cols - 1)) / cols;

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // My tickets, joined to their raffle.
    const { data: mine } = await supabase
      .from("tickets")
      .select("seat_number, raffle_id, raffles!raffle_id(id, title, prize, cover_url, capacity, amount_cents, status, no_seats)")
      .eq("owner_id", user.id)
      .order("seat_number");

    // Which of my raffles I won.
    const { data: wins } = await supabase.from("draws").select("raffle_id").eq("winner_id", user.id);
    const wonSet = new Set((wins ?? []).map((w: any) => w.raffle_id));

    // Total claimed per raffle for the sellout bar.
    const raffleIds = [...new Set((mine ?? []).map((t: any) => t.raffle_id))];
    const soldMap: Record<string, number> = {};
    if (raffleIds.length) {
      const { data: tix } = await supabase.from("tickets").select("raffle_id").in("raffle_id", raffleIds);
      (tix ?? []).forEach((t: any) => { soldMap[t.raffle_id] = (soldMap[t.raffle_id] ?? 0) + 1; });
    }

    // Group my seats by raffle.
    const map: Record<string, Entry> = {};
    (mine ?? []).forEach((t: any) => {
      const r = t.raffles;
      if (!r) return;
      if (!map[r.id]) {
        map[r.id] = {
          raffleId: r.id, title: r.title, prize: r.prize, cover_url: r.cover_url,
          capacity: r.capacity, amount_cents: r.amount_cents, status: r.status,
          seats: [], sold: soldMap[r.id] ?? 0, won: wonSet.has(r.id), noSeats: !!r.no_seats,
        };
      }
      map[r.id].seats.push(t.seat_number);
    });
    setEntries(Object.values(map));
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const money = (c: number) => `$${c % 100 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;
  const seatLabel = (e: Entry) => {
    const n = e.seats.length;
    if (e.noSeats) return `${n} ${n === 1 ? "entry" : "entries"}`;
    const s = [...e.seats].sort((a, b) => a - b);
    return `${n === 1 ? "Seat" : "Seats"} ${s.map((x) => `#${x}`).join(", ")}`;
  };
  const counts = {
    all: entries.length,
    active: entries.filter((e) => e.status === "open").length,
    won: entries.filter((e) => e.won).length,
    past: entries.filter((e) => e.status !== "open" && !e.won).length,
  };
  const visible = entries.filter((e) =>
    tab === "all" ? true : tab === "active" ? e.status === "open" : tab === "won" ? e.won : e.status !== "open" && !e.won,
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.red} />}
      >
        <Text style={styles.h1}>My tickets</Text>

        <View style={styles.tabs}>
          {([["all", "All"], ["active", "Active"], ["won", "Won"], ["past", "Past"]] as [Tab, string][]).map(([k, label]) => (
            <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabActive]} onPress={() => setTab(k)}>
              <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{label} {counts[k]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.red} style={{ marginTop: 40 }} />
        ) : visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{tab === "won" ? "No wins yet." : tab === "active" ? "No active entries." : "Nothing here yet."}</Text>
            <Text style={styles.emptyHint}>Browse games and grab a seat to see it here.</Text>
            <TouchableOpacity style={styles.cta} onPress={() => router.replace("/")}>
              <Text style={styles.ctaText}>Browse games</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.grid}>
            {visible.map((e) => (
              <View key={e.raffleId} style={{ width: cardW }}>
                <GameCard
                  data={{ id: e.raffleId, title: e.title, cover_url: e.cover_url, amount_cents: e.amount_cents, capacity: e.capacity, claimed: e.sold }}
                  width={cardW}
                  onPress={() => router.push(`/raffle/${e.raffleId}`)}
                  badge={e.won ? "WON" : undefined}
                  footRight={e.noSeats ? `${e.seats.length}×` : `${e.seats.length} seat${e.seats.length === 1 ? "" : "s"}`}
                />
                <Text style={styles.seatCaption} numberOfLines={2}>🎟 {seatLabel(e)}</Text>
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
  h1: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.4, marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  seatCaption: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 6 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 18 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabActive: { backgroundColor: colors.redSoft, borderColor: colors.red },
  tabText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: colors.text },
  empty: { alignItems: "center", marginTop: 40, gap: 8 },
  emptyText: { color: colors.text, fontSize: 16, fontWeight: "800" },
  emptyHint: { color: colors.muted, fontSize: 13, textAlign: "center", maxWidth: 280 },
  cta: { marginTop: 12, backgroundColor: colors.red, paddingVertical: 12, paddingHorizontal: 22, borderRadius: radius.md },
  ctaText: { color: colors.onAccent, fontWeight: "800" },
  card: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 12 },
  cardWon: { borderColor: colors.red },
  thumb: { width: 96, height: 96 },
  cardBody: { flex: 1, padding: 12, justifyContent: "center" },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800", flex: 1 },
  wonPill: { backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  wonPillText: { color: colors.onAccent, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  seats: { color: colors.muted, fontSize: 12, marginTop: 3 },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginTop: 10, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.red },
  cardFoot: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  foot: { color: colors.text, fontSize: 12, fontWeight: "800" },
  footMuted: { color: colors.muted, fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
});
