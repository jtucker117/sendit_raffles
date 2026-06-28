import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

type FollowedHost = { id: string; name: string; code: string | null; count: number };
type Referrer = { id: string; name: string; count: number };

export default function Referrals() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [myCode, setMyCode] = useState("");
  const [followed, setFollowed] = useState<FollowedHost[]>([]);
  const [total, setTotal] = useState(0);
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [incomingTotal, setIncomingTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const isHost = user?.role === "host";

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data: code } = await supabase.rpc("ensure_referral_code");
    setMyCode((code as string) ?? "");

    const { data: f } = await supabase.from("host_followers").select("host_id").eq("follower_id", user.id);
    const hostIds = (f ?? []).map((x: any) => x.host_id);
    let hostsInfo: any[] = [];
    if (hostIds.length) {
      const { data: hp } = await supabase.from("profiles").select("id, display_name, host_code").in("id", hostIds);
      hostsInfo = hp ?? [];
    }
    const { data: mine } = await supabase.from("referrals").select("host_id").eq("referrer_id", user.id);
    const countByHost: Record<string, number> = {};
    (mine ?? []).forEach((r: any) => { countByHost[r.host_id] = (countByHost[r.host_id] ?? 0) + 1; });
    setTotal((mine ?? []).length);
    setFollowed(hostsInfo.map((h) => ({ id: h.id, name: h.display_name, code: h.host_code, count: countByHost[h.id] ?? 0 })));

    if (user.role === "host") {
      const { data: into } = await supabase.from("referrals").select("referrer_id").eq("host_id", user.id);
      const cbr: Record<string, number> = {};
      (into ?? []).forEach((r: any) => { cbr[r.referrer_id] = (cbr[r.referrer_id] ?? 0) + 1; });
      const rids = Object.keys(cbr);
      const names: Record<string, string> = {};
      if (rids.length) {
        const { data: np } = await supabase.from("profiles").select("id, display_name").in("id", rids);
        (np ?? []).forEach((p: any) => { names[p.id] = p.display_name; });
      }
      setReferrers(rids.map((id) => ({ id, name: names[id] ?? "Player", count: cbr[id] })).sort((a, b) => b.count - a.count));
      setIncomingTotal((into ?? []).length);
    }
    setLoading(false);
  }, [user?.id, user?.role]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "https://lootvault.app";
  const linkFor = (h: FollowedHost) => `${origin}/join?code=${h.code ?? ""}&ref=${myCode}`;

  function share(h: FollowedHost) {
    const link = linkFor(h);
    if (typeof navigator !== "undefined" && (navigator as any).clipboard) {
      (navigator as any).clipboard.writeText(link);
      Alert.alert("Invite link copied", `Share it so people join ${h.name}'s group with your code.`);
    } else {
      Alert.alert("Your invite link", link);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 40 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.red} />}
    >
      <Text style={styles.h1}>Referrals</Text>
      <Text style={styles.sub}>Invite people to a host's group. When they join with your code, you earn a referral — worth free entries in that host's giveaways.</Text>

      {/* My code + record */}
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>YOUR REFERRAL CODE</Text>
        <Text style={styles.codeValue}>{myCode || "…"}</Text>
        <View style={styles.recordRow}>
          <View style={styles.recordBox}><Text style={styles.recordVal}>{total}</Text><Text style={styles.recordLabel}>Referrals made</Text></View>
          {isHost && <View style={styles.recordBox}><Text style={styles.recordVal}>{incomingTotal}</Text><Text style={styles.recordLabel}>Into your group</Text></View>}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.red} style={{ marginTop: 30 }} />
      ) : (
        <>
          {/* Share links per followed host */}
          <Text style={styles.section}>Invite to a group</Text>
          {followed.length === 0 ? (
            <Text style={styles.empty}>Follow a host first, then you can invite people to their group.</Text>
          ) : (
            followed.map((h) => (
              <View key={h.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{h.name}</Text>
                  <Text style={styles.rowMeta}>{h.count} referral{h.count === 1 ? "" : "s"} so far</Text>
                </View>
                <TouchableOpacity style={[styles.shareBtn, !h.code && styles.dim]} disabled={!h.code} onPress={() => share(h)}>
                  <Text style={styles.shareText}>Copy invite</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          {/* Host: who's referring into your group */}
          {isHost && (
            <>
              <Text style={styles.section}>Top referrers in your group</Text>
              {referrers.length === 0 ? (
                <Text style={styles.empty}>No referrals into your group yet.</Text>
              ) : (
                referrers.map((r, i) => (
                  <TouchableOpacity key={r.id} style={styles.row} activeOpacity={0.8} onPress={() => router.push(`/u/${r.id}`)}>
                    <Text style={styles.rank}>{["🥇", "🥈", "🥉"][i] ?? `${i + 1}`}</Text>
                    <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>{r.name}</Text>
                    <Text style={styles.rowMeta}>{r.count}</Text>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}
        </>
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.4 },
  sub: { color: colors.muted, fontSize: 13.5, lineHeight: 19, marginTop: 6, marginBottom: 18 },
  codeCard: { backgroundColor: colors.surface, borderColor: colors.red, borderWidth: 1, borderRadius: radius.lg, padding: 16, alignItems: "center" },
  codeLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  codeValue: { color: colors.red, fontSize: 34, fontWeight: "900", letterSpacing: 4, marginTop: 4 },
  recordRow: { flexDirection: "row", gap: 12, marginTop: 14, alignSelf: "stretch" },
  recordBox: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  recordVal: { color: colors.text, fontSize: 22, fontWeight: "900" },
  recordLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  section: { color: colors.text, fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 22, marginBottom: 10 },
  empty: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 10 },
  rowName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  rowMeta: { color: colors.muted, fontSize: 12.5, fontWeight: "600", marginTop: 2 },
  rank: { fontSize: 16, width: 24, textAlign: "center" },
  shareBtn: { backgroundColor: colors.red, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 14 },
  shareText: { color: colors.onAccent, fontWeight: "800", fontSize: 13 },
  dim: { opacity: 0.4 },
  backBtn: { alignSelf: "center", marginTop: 20, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
