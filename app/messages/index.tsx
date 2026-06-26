import { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useMessaging } from "@/lib/use-messaging";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

type Tab = "direct" | "communities" | "announce";

export default function Messages() {
  const router = useRouter();
  const { user, isSuperadmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { fetchDirectMessageConversations } = useMessaging();

  const [tab, setTab] = useState<Tab>("direct");
  const [convos, setConvos] = useState<any[]>([]);
  const [communities, setCommunities] = useState<{ id: string; name: string; own?: boolean }[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [annText, setAnnText] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // Direct conversations
    setConvos(await fetchDirectMessageConversations(user.id));
    // Communities: hosts I follow (+ my own if I'm a host)
    const { data: follows } = await supabase.from("host_followers").select("host_id").eq("follower_id", user.id);
    const hostIds = (follows ?? []).map((f: any) => f.host_id);
    const comm: { id: string; name: string; own?: boolean }[] = [];
    if (user.role === "host") comm.push({ id: user.id, name: "Your community", own: true });
    if (hostIds.length) {
      const { data: hosts } = await supabase.from("profiles").select("id, display_name").in("id", hostIds);
      (hosts ?? []).forEach((h: any) => comm.push({ id: h.id, name: h.display_name }));
    }
    setCommunities(comm);
    // Announcements
    const { data: ann } = await supabase.from("announcements").select("id, content, created_at").order("created_at", { ascending: false });
    setAnnouncements(ann ?? []);
    setLoading(false);
  }, [user?.id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function postAnnouncement() {
    if (!annText.trim()) return;
    setPosting(true);
    const { error } = await supabase.from("announcements").insert({ author_id: user!.id, content: annText.trim() });
    if (!error) { setAnnText(""); await load(); }
    setPosting(false);
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.red} />}
      >
        <Text style={styles.h1}>Messages</Text>

        <View style={styles.tabs}>
          {([["direct", "Direct"], ["communities", "Communities"], ["announce", "Announcements"]] as [Tab, string][]).map(([k, label]) => (
            <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabActive]} onPress={() => setTab(k)}>
              <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? <ActivityIndicator color={colors.red} style={{ marginTop: 40 }} /> : (
          <>
            {/* DIRECT */}
            {tab === "direct" && (
              <>
                <TouchableOpacity style={styles.newBtn} onPress={() => router.push("/messages/new")}>
                  <Text style={styles.newBtnText}>+ New message</Text>
                </TouchableOpacity>
                {convos.length === 0 ? (
                  <Text style={styles.empty}>No conversations yet.</Text>
                ) : convos.map((c) => (
                  <TouchableOpacity key={c.otherUser.id} style={styles.row} onPress={() => router.push(`/messages/chat/${c.otherUser.id}`)}>
                    <View style={styles.avatar}><Text style={styles.avatarInitial}>{c.otherUser.display_name?.[0]?.toUpperCase() ?? "?"}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{c.otherUser.display_name}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{c.sender_id === user?.id ? "You: " : ""}{c.content}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* COMMUNITIES */}
            {tab === "communities" && (
              communities.length === 0 ? (
                <Text style={styles.empty}>Follow a host to join their community chat.</Text>
              ) : communities.map((c) => (
                <TouchableOpacity key={c.id} style={styles.row} onPress={() => router.push(`/messages/group/${c.id}`)}>
                  <View style={[styles.avatar, { backgroundColor: colors.navy }]}><Text style={styles.avatarInitial}>{c.name[0]?.toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{c.name}{c.own ? "" : " · Community"}</Text>
                    <Text style={styles.rowSub}>{c.own ? "Your players' chat room" : "Group chat"}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            {/* ANNOUNCEMENTS */}
            {tab === "announce" && (
              <>
                {isSuperadmin && (
                  <View style={styles.composer}>
                    <TextInput style={styles.composerInput} placeholder="Post a platform update…" placeholderTextColor={colors.faint} value={annText} onChangeText={setAnnText} multiline />
                    <TouchableOpacity style={[styles.newBtn, { marginTop: 10 }, posting && { opacity: 0.5 }]} disabled={posting} onPress={postAnnouncement}>
                      <Text style={styles.newBtnText}>{posting ? "Posting…" : "Post announcement"}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {announcements.length === 0 ? (
                  <Text style={styles.empty}>No announcements yet.</Text>
                ) : announcements.map((a) => (
                  <View key={a.id} style={styles.annCard}>
                    <Text style={styles.annText}>{a.content}</Text>
                    <Text style={styles.annTime}>{new Date(a.created_at).toLocaleString()}</Text>
                  </View>
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
  h1: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.4, marginBottom: 16 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 18 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabActive: { backgroundColor: colors.redSoft, borderColor: colors.red },
  tabText: { color: colors.muted, fontWeight: "700", fontSize: 12.5 },
  tabTextActive: { color: colors.text },
  newBtn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 12, alignItems: "center", marginBottom: 14 },
  newBtnText: { color: colors.onAccent, fontWeight: "800", fontSize: 14 },
  empty: { color: colors.muted, fontSize: 14, marginTop: 24, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.red, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: colors.onAccent, fontWeight: "900", fontSize: 18 },
  rowName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  rowSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  composer: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 14, marginBottom: 16 },
  composerInput: { backgroundColor: colors.surfaceAlt, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, color: colors.text, fontSize: 14, minHeight: 70, textAlignVertical: "top" },
  annCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  annText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  annTime: { color: colors.faint, fontSize: 11, marginTop: 8 },
});
