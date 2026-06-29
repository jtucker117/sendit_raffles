import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";
import { GameCard } from "@/components/GameCard";

interface Prof {
  id: string; display_name: string; role: "host" | "player";
  avatar_url: string | null; cover_url: string | null; bio: string | null;
  host_code: string | null; host_approved: boolean | null; email: string | null; is_superadmin: boolean;
}
interface Game {
  id: string; title: string; cover_url: string | null; amount_cents: number; capacity: number; status: string; claimed: number;
}
type Tab = "active" | "past";

export default function UserProfileView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isSuperadmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cols = width >= 1100 ? 4 : width >= 760 ? 3 : 2;
  const gap = 14;
  const contentW = Math.min(width, 1100) - 40;
  const cardW = (contentW - gap * (cols - 1)) / cols;

  const [prof, setProf] = useState<Prof | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [followers, setFollowers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("active");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, role, avatar_url, cover_url, bio, host_code, host_approved, email, is_superadmin")
      .eq("id", id).maybeSingle();
    setProf((data as Prof) ?? null);

    if (data?.role === "host") {
      // Main games only (minis are sub-games), newest first.
      const { data: rs } = await supabase.from("raffles")
        .select("id, title, cover_url, amount_cents, capacity, status, parent_raffle_id")
        .eq("host_id", id).is("parent_raffle_id", null).order("created_at", { ascending: false });
      const rows = (rs ?? []) as any[];
      // Paid-sold tally for the card progress bars.
      const ids = rows.map((r) => r.id);
      const sold: Record<string, number> = {};
      if (ids.length) {
        const { data: tix } = await supabase.from("tickets").select("raffle_id, type").in("raffle_id", ids);
        (tix ?? []).forEach((t: any) => { if (t.type === "paid") sold[t.raffle_id] = (sold[t.raffle_id] ?? 0) + 1; });
      }
      setGames(rows.map((r) => ({
        id: r.id, title: r.title, cover_url: r.cover_url, amount_cents: r.amount_cents,
        capacity: r.capacity, status: r.status, claimed: sold[r.id] ?? 0,
      })));
      const { count } = await supabase.from("host_followers").select("follower_id", { count: "exact", head: true }).eq("host_id", id);
      setFollowers(count ?? 0);
    } else { setGames([]); setFollowers(0); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  if (!prof) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>This profile isn’t available to you.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </View>
    );
  }

  const isSelf = prof.id === user?.id;
  const roleLabel = prof.role === "host"
    ? `🎡 Host${prof.host_approved === true ? " · Approved" : prof.host_approved === null ? " · Pending" : " · Not approved"}`
    : "🎫 Player";
  const isActive = (s: string) => s === "open" || s === "scheduled" || s === "draft";
  const active = games.filter((g) => isActive(g.status));
  const past = games.filter((g) => !isActive(g.status));
  const drawn = games.filter((g) => g.status === "complete").length;
  const visible = tab === "active" ? active : past;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
        <View style={styles.coverWrap}>
          {prof.cover_url ? <Image source={{ uri: prof.cover_url }} style={styles.cover} /> : <View style={[styles.cover, { backgroundColor: colors.navy }]} />}
        </View>

        <View style={styles.identity}>
          {prof.avatar_url
            ? <Image source={{ uri: prof.avatar_url }} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarPh]}><Text style={styles.avatarInitial}>{prof.display_name?.[0]?.toUpperCase() ?? "?"}</Text></View>}
          <Text style={styles.name}>{prof.display_name}</Text>
          <Text style={styles.role}>{roleLabel}{prof.is_superadmin ? " · 🛡️ Superadmin" : ""}</Text>
          {isSuperadmin && prof.email ? <Text style={styles.email}>{prof.email}</Text> : null}

          {prof.role === "host" && prof.host_code ? (
            <View style={styles.codeChip}>
              <Text style={styles.codeLabel}>HOST CODE</Text>
              <Text style={styles.codeValue}>{prof.host_code}</Text>
            </View>
          ) : null}

          {prof.bio?.trim() ? <Text style={styles.bio}>{prof.bio}</Text> : null}

          {!isSelf && (
            <TouchableOpacity style={styles.msgBtn} onPress={() => router.push(`/messages/chat/${prof.id}` as any)}>
              <Text style={styles.msgBtnText}>Message</Text>
            </TouchableOpacity>
          )}
        </View>

        {prof.role === "host" && (
          <>
            {/* Stats */}
            <View style={styles.stats}>
              <Stat label="Followers" value={followers} colors={colors} />
              <Stat label="Games" value={games.length} colors={colors} />
              <Stat label="Active" value={active.length} colors={colors} />
              <Stat label="Drawn" value={drawn} colors={colors} />
            </View>

            {/* Active / Past tabs */}
            <View style={styles.tabs}>
              {(["active", "past"] as Tab[]).map((k) => (
                <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabActive]} onPress={() => setTab(k)}>
                  <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>
                    {k === "active" ? `Active (${active.length})` : `Past (${past.length})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.feed}>
              {visible.length === 0
                ? <Text style={styles.muted}>{tab === "active" ? "No active games right now." : "No past games yet."}</Text>
                : (
                  <View style={styles.grid}>
                    {visible.map((g) => (
                      <GameCard
                        key={g.id}
                        data={{ id: g.id, title: g.title, cover_url: g.cover_url, amount_cents: g.amount_cents, capacity: g.capacity, claimed: g.claimed, status: g.status }}
                        width={cardW}
                        onPress={() => router.push(`/raffle/${g.id}`)}
                      />
                    ))}
                  </View>
                )}
            </View>
          </>
        )}

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, colors }: { label: string; value: number; colors: AppColors }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const AVATAR = 92;
const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12, padding: 24 },
  muted: { color: colors.muted, textAlign: "center" },
  coverWrap: { height: 150, backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, overflow: "hidden" },
  cover: { width: "100%", height: 150 },
  identity: { alignItems: "center", paddingHorizontal: 20, marginTop: -AVATAR / 2 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, borderWidth: 4, borderColor: colors.bg, backgroundColor: colors.surface },
  avatarPh: { alignItems: "center", justifyContent: "center", backgroundColor: colors.navy },
  avatarInitial: { color: "#fff", fontSize: 34, fontWeight: "800" },
  name: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 10 },
  role: { color: colors.muted, fontSize: 14, marginTop: 2 },
  email: { color: colors.faint, fontSize: 13, marginTop: 2 },
  codeChip: { alignItems: "center", marginTop: 14, backgroundColor: colors.surface, borderColor: colors.red, borderWidth: 1, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 18 },
  codeLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  codeValue: { color: colors.red, fontSize: 20, fontWeight: "900", letterSpacing: 3, marginTop: 2 },
  bio: { color: colors.text, fontSize: 14, textAlign: "center", marginTop: 14, lineHeight: 20, maxWidth: 460 },
  msgBtn: { marginTop: 16, backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 28 },
  msgBtnText: { color: colors.onAccent, fontWeight: "800", fontSize: 14 },
  stats: { flexDirection: "row", marginTop: 24, marginHorizontal: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 14 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 18, marginHorizontal: 20 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabActive: { backgroundColor: colors.redSoft, borderColor: colors.red },
  tabText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: colors.text },
  feed: { paddingHorizontal: 20, marginTop: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  backBtn: { alignSelf: "center", marginTop: 26, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
