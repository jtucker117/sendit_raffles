import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Image, RefreshControl,
} from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { BottomNav, BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

const LOGO = require("../assets/logo.png");

interface RaffleRow {
  id: string; title: string; prize: string | null; cover_url: string | null;
  capacity: number; entry_word: string; amount_cents: number;
}

export default function Home() {
  const { user, loading, isHostApproved, isHostPending, isSuperadmin } = useAuth();
  const router = useRouter();
  const [raffles, setRaffles] = useState<RaffleRow[]>([]);
  const [loadingRaffles, setLoadingRaffles] = useState(true);

  const loadRaffles = useCallback(async () => {
    if (!user) return;
    setLoadingRaffles(true);
    const { data } = await supabase.from("raffles").select("*").eq("status", "open").order("created_at", { ascending: false });
    if (data) setRaffles(data as RaffleRow[]);
    setLoadingRaffles(false);
  }, [user]);

  useEffect(() => { loadRaffles(); }, [loadRaffles]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.red} /></View>;
  }
  if (!user) {
    return (
      <View style={styles.center}>
        <Image source={LOGO} style={styles.bigLogo} resizeMode="contain" />
        <Text style={styles.tag}>Provably-fair raffles</Text>
      </View>
    );
  }

  const money = (c: number) => `$${(c / 100).toFixed(0)}`;
  const isHost = user.role === "host";

  const chips: { label: string; onPress: () => void }[] = [];
  if (isHost && isHostApproved) {
    chips.push({ label: "🎡 Create raffle", onPress: () => router.push("/host/create-raffle") });
    chips.push({ label: "👥 Groups", onPress: () => router.push("/host/groups") });
    chips.push({ label: "🔑 Join group", onPress: () => router.push("/join") });
  }
  if (!isHost) {
    chips.push({ label: "🔑 Follow a host", onPress: () => router.push("/join") });
  }
  if (isSuperadmin) {
    chips.push({ label: "🛡️ All accounts", onPress: () => router.push("/admin/users") });
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
        refreshControl={<RefreshControl refreshing={loadingRaffles} onRefresh={loadRaffles} tintColor={colors.red} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.hi}>{user.display_name}</Text>
            <Text style={styles.role}>{isHost ? "🎡 Host" : "🎫 Player"}{isSuperadmin ? " · 🛡️ Superadmin" : ""}</Text>
          </View>
        </View>

        {/* Host approval banner */}
        {isHost && isHostPending && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>⏳ Your host account is pending approval. You can browse, but can't create raffles yet.</Text>
          </View>
        )}

        {/* Quick action chips */}
        {chips.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {chips.map((c) => (
              <TouchableOpacity key={c.label} style={styles.chip} onPress={c.onPress}>
                <Text style={styles.chipText}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Feed */}
        <Text style={styles.feedTitle}>{isHost ? "Open raffles" : "Raffles from hosts you follow"}</Text>
        {loadingRaffles ? (
          <ActivityIndicator color={colors.red} style={{ marginTop: 24 }} />
        ) : raffles.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No raffles yet.</Text>
            <Text style={styles.emptyHint}>{isHost ? "Create your first raffle." : "Follow a host with their code to see raffles."}</Text>
          </View>
        ) : (
          raffles.map((r) => (
            <TouchableOpacity key={r.id} style={styles.card} activeOpacity={0.85} onPress={() => router.push(`/raffle/${r.id}`)}>
              {r.cover_url ? <Image source={{ uri: r.cover_url }} style={styles.cover} /> : <View style={[styles.cover, styles.coverPh]} />}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{r.title}</Text>
                {r.prize ? <Text style={styles.cardPrize}>🏆 {r.prize}</Text> : null}
                <Text style={styles.cardMeta}>{r.capacity} seats · {money(r.amount_cents)} / {r.entry_word}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 8 },
  bigLogo: { width: 200, height: 200 },
  tag: { color: colors.muted, fontSize: 15 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  logo: { width: 48, height: 48 },
  hi: { color: colors.text, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  role: { color: colors.muted, fontSize: 13, marginTop: 1 },
  banner: { backgroundColor: colors.amberSoft, borderColor: colors.amber, borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 16 },
  bannerText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  chipsRow: { gap: 8, paddingBottom: 4, marginBottom: 12 },
  chip: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  chipText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  feedTitle: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 6, marginBottom: 12 },
  empty: { alignItems: "center", marginTop: 30, gap: 6 },
  emptyText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  emptyHint: { color: colors.muted, fontSize: 13, textAlign: "center", maxWidth: 280 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 14 },
  cover: { width: "100%", height: 160 },
  coverPh: { backgroundColor: colors.navy },
  cardBody: { padding: 14 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  cardPrize: { color: colors.muted, fontSize: 14, marginTop: 4 },
  cardMeta: { color: colors.faint, fontSize: 12, marginTop: 8, textTransform: "capitalize" },
});
