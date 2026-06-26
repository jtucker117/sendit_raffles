import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";
import { RaffleGrid } from "@/components/RaffleGrid";

interface Prof {
  id: string; display_name: string; role: "host" | "player";
  avatar_url: string | null; cover_url: string | null; bio: string | null;
  host_code: string | null; host_approved: boolean | null; email: string | null; is_superadmin: boolean;
}

export default function UserProfileView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isSuperadmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [prof, setProf] = useState<Prof | null>(null);
  const [raffles, setRaffles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, role, avatar_url, cover_url, bio, host_code, host_approved, email, is_superadmin")
      .eq("id", id).maybeSingle();
    setProf((data as Prof) ?? null);
    if (data?.role === "host") {
      const { data: rs } = await supabase.from("raffles").select("*").eq("host_id", id).eq("status", "open").order("created_at", { ascending: false });
      setRaffles(rs ?? []);
    } else setRaffles([]);
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
          <View style={styles.feed}>
            <Text style={styles.feedTitle}>Open raffles</Text>
            {raffles.length === 0
              ? <Text style={styles.muted}>No open raffles right now.</Text>
              : <RaffleGrid raffles={raffles as any} onPress={(rid) => router.push(`/raffle/${rid}`)} />}
          </View>
        )}

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const AVATAR = 92;
const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12, padding: 24 },
  muted: { color: colors.muted, textAlign: "center" },
  coverWrap: { height: 150, backgroundColor: colors.surfaceAlt },
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
  feed: { paddingHorizontal: 20, marginTop: 28 },
  feedTitle: { color: colors.text, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 },
  backBtn: { alignSelf: "center", marginTop: 26, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
