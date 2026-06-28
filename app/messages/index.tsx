import { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useMessaging } from "@/lib/use-messaging";
import { supabase } from "@/lib/supabase";
import { showError } from "@/lib/notify";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

type Tab = "direct" | "communities";

export default function Messages() {
  const router = useRouter();
  const { user, isSuperadmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { fetchDirectMessageConversations } = useMessaging();

  const [tab, setTab] = useState<Tab>("direct");
  const [convos, setConvos] = useState<any[]>([]);
  const [communities, setCommunities] = useState<{ id: string; name: string; own?: boolean; kind: "room" | "host"; sub: string; unread?: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // Direct conversations + which have unread (sent to me, not yet read)
    const convosList = await fetchDirectMessageConversations(user.id);
    const { data: unreadDM } = await supabase.from("direct_messages").select("sender_id").eq("recipient_id", user.id).is("read_at", null);
    const unreadSenders = new Set((unreadDM ?? []).map((m: any) => m.sender_id));
    setConvos(convosList.map((c: any) => ({ ...c, unread: unreadSenders.has(c.otherUser.id) })));
    // Groups: each host has one group chat (host + their players). Mine if I'm a
    // host, plus the groups of every host I follow. Named "<Host> Group".
    const { data: follows } = await supabase.from("host_followers").select("host_id").eq("follower_id", user.id);
    const hostIds = (follows ?? []).map((f: any) => f.host_id);
    const comm: { id: string; name: string; own?: boolean; kind: "room" | "host"; sub: string }[] = [];
    // Permanent platform rooms, pinned at the top.
    comm.push({ id: "everyone", name: "Community", kind: "room", sub: "Everyone — players & hosts" });
    if (user.role === "host" || isSuperadmin) comm.push({ id: "hosts", name: "Hosts", kind: "room", sub: "Hosts & creator only" });
    // Per-host groups.
    if (user.role === "host") {
      const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      comm.push({ id: user.id, name: `${me?.display_name ?? "Your"} Group`, own: true, kind: "host", sub: "You & your players" });
    }
    if (hostIds.length) {
      const { data: hosts } = await supabase.from("profiles").select("id, display_name").in("id", hostIds);
      (hosts ?? []).forEach((h: any) => comm.push({ id: h.id, name: `${h.display_name} Group`, kind: "host", sub: "Host & players" }));
    }
    // Unread state for each group/room: newest message later than my last read of it.
    const { data: reads } = await supabase.from("chat_reads").select("room_key, last_read_at").eq("user_id", user.id);
    const readMap: Record<string, string> = {};
    (reads ?? []).forEach((r: any) => { readMap[r.room_key] = r.last_read_at; });
    await Promise.all(comm.map(async (c) => {
      const key = c.kind === "room" ? `room:${c.id}` : `host:${c.id}`;
      const { data: latest } = c.kind === "room"
        ? await supabase.from("platform_chat").select("created_at, author_id").eq("room", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
        : await supabase.from("host_chat").select("created_at, author_id").eq("host_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const lastRead = readMap[key];
      c.unread = !!latest && (latest as any).author_id !== user.id && (!lastRead || (latest as any).created_at > lastRead);
    }));
    setCommunities([...comm]);
    setLoading(false);
  }, [user?.id, user?.role, isSuperadmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function toggleDMRead(c: any, makeRead: boolean) {
    if (!user?.id) return;
    if (makeRead) await supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("recipient_id", user.id).eq("sender_id", c.otherUser.id).is("read_at", null);
    else await supabase.from("direct_messages").update({ read_at: null }).eq("recipient_id", user.id).eq("sender_id", c.otherUser.id);
    load();
  }
  // Open a DM and mark it read in the same tap (this is the "auto-read on open").
  async function openDM(c: any) {
    if (c.unread && user?.id) {
      const { error } = await supabase.from("direct_messages").update({ read_at: new Date().toISOString() })
        .eq("recipient_id", user.id).eq("sender_id", c.otherUser.id).is("read_at", null);
      if (error) { showError(error, "Couldn't mark read"); return; }
    }
    router.push(`/messages/chat/${c.otherUser.id}`);
  }
  async function toggleGroupRead(c: any, makeRead: boolean) {
    if (!user?.id) return;
    const key = c.kind === "room" ? `room:${c.id}` : `host:${c.id}`;
    const { error } = makeRead
      ? await supabase.from("chat_reads").upsert({ user_id: user.id, room_key: key, last_read_at: new Date().toISOString() })
      : await supabase.from("chat_reads").delete().eq("user_id", user.id).eq("room_key", key);
    if (error) { showError(error, "Couldn't update read state"); return; }
    load();
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.red} />}
      >
        <Text style={styles.h1}>Messages</Text>

        <View style={styles.tabs}>
          {([["direct", "Direct"], ["communities", "Groups"]] as [Tab, string][]).map(([k, label]) => (
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
                  <TouchableOpacity key={c.otherUser.id} style={[styles.row, c.unread && styles.rowUnread]} onPress={() => openDM(c)}>
                    <View style={styles.avatar}><Text style={styles.avatarInitial}>{c.otherUser.display_name?.[0]?.toUpperCase() ?? "?"}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, c.unread && styles.rowNameUnread]}>{c.otherUser.display_name}</Text>
                      <Text style={[styles.rowSub, c.unread && styles.rowSubUnread]} numberOfLines={1}>{c.sender_id === user?.id ? "You: " : ""}{c.content}</Text>
                    </View>
                    <TouchableOpacity onPress={() => toggleDMRead(c, !!c.unread)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name={c.unread ? "mail-unread" : "mail-open-outline"} size={20} color={c.unread ? colors.red : colors.faint} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* COMMUNITIES */}
            {tab === "communities" && (
              communities.length === 0 ? (
                <Text style={styles.empty}>Follow a host to join their group chat.</Text>
              ) : communities.map((c) => (
                <TouchableOpacity key={c.kind + c.id} style={[styles.row, c.unread && styles.rowUnread]} onPress={() => router.push(c.kind === "room" ? `/messages/room/${c.id}` : `/messages/group/${c.id}`)}>
                  <View style={[styles.avatar, { backgroundColor: c.kind === "room" ? colors.red : colors.navy }]}><Text style={styles.avatarInitial}>{c.name[0]?.toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, c.unread && styles.rowNameUnread]}>{c.name}</Text>
                    <Text style={[styles.rowSub, c.unread && styles.rowSubUnread]}>{c.sub}</Text>
                  </View>
                  <TouchableOpacity onPress={() => toggleGroupRead(c, !!c.unread)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name={c.unread ? "mail-unread" : "mail-open-outline"} size={20} color={c.unread ? colors.red : colors.faint} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
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
  rowUnread: { backgroundColor: colors.redSoft, borderColor: colors.red },
  rowNameUnread: { fontWeight: "900" },
  rowSubUnread: { color: colors.text, fontWeight: "700" },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red },
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
