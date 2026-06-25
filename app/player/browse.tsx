import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { BottomNav, BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

interface RaffleRow {
  id: string;
  title: string;
  prize: string | null;
  cover_url: string | null;
  capacity: number;
  entry_word: string;
  amount_cents: number;
  status: string;
}

export default function BrowseRafflesScreen() {
  const router = useRouter();
  const [raffles, setRaffles] = useState<RaffleRow[]>([]);
  const [loading, setLoading] = useState(true);

  // RLS only returns raffles from hosts the player follows (or superadmin) —
  // so this is automatically the player's "feed" of accessible raffles.
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("raffles")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (data) setRaffles(data as RaffleRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const money = (c: number) => `$${(c / 100).toFixed(0)}`;

  return (
    <View style={styles.container}>
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.red} />}
    >
      <Text style={styles.h1}>🎫 Raffles</Text>
      <Text style={styles.sub}>Raffles from hosts you follow</Text>

      {loading ? (
        <ActivityIndicator color={colors.red} style={{ marginTop: 30 }} />
      ) : raffles.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No raffles yet.</Text>
          <Text style={styles.emptyHint}>Follow a host with their code to see their raffles.</Text>
          <TouchableOpacity style={styles.followBtn} onPress={() => router.push("/join")}>
            <Text style={styles.followText}>🔑 Follow a host</Text>
          </TouchableOpacity>
        </View>
      ) : (
        raffles.map((r) => (
          <TouchableOpacity key={r.id} style={styles.card} activeOpacity={0.85} onPress={() => router.push(`/raffle/${r.id}`)}>
            {r.cover_url ? <Image source={{ uri: r.cover_url }} style={styles.cover} /> : <View style={[styles.cover, styles.coverPlaceholder]} />}
            <View style={styles.body}>
              <Text style={styles.title}>{r.title}</Text>
              {r.prize ? <Text style={styles.prize}>🏆 {r.prize}</Text> : null}
              <Text style={styles.meta}>{r.capacity} seats · {money(r.amount_cents)} / {r.entry_word}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}

    </ScrollView>
    <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 18 },
  empty: { alignItems: "center", marginTop: 40, gap: 8 },
  emptyText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  emptyHint: { color: colors.muted, fontSize: 13, textAlign: "center", maxWidth: 280 },
  followBtn: { marginTop: 12, backgroundColor: colors.red, paddingVertical: 12, paddingHorizontal: 22, borderRadius: radius.md },
  followText: { color: colors.onAccent, fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 14 },
  cover: { width: "100%", height: 140 },
  coverPlaceholder: { backgroundColor: colors.navy },
  body: { padding: 14 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  prize: { color: colors.muted, fontSize: 14, marginTop: 4 },
  meta: { color: colors.faint, fontSize: 12, marginTop: 8, textTransform: "capitalize" },
  backBtn: { alignSelf: "center", marginTop: 18, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
