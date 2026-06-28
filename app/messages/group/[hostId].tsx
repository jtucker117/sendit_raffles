import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

interface Msg { id: string; author_id: string; content: string; created_at: string; }

export default function HostCommunityChat() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>();
  const router = useRouter();
  const { user, isSuperadmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [hostName, setHostName] = useState("");
  const [chatEnabled, setChatEnabled] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const isHostRoom = hostId === user?.id;

  const load = useCallback(async () => {
    if (!hostId) return;
    const { data: h } = await supabase.from("profiles").select("display_name, chat_enabled").eq("id", hostId).maybeSingle();
    setHostName(h?.display_name ?? "Host");
    setChatEnabled(h?.chat_enabled ?? true);
    const { data: msgs } = await supabase.from("host_chat").select("id, author_id, content, created_at").eq("host_id", hostId).order("created_at");
    const list = (msgs ?? []) as Msg[];
    setMessages(list);
    const ids = [...new Set(list.map((m) => m.author_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.display_name; });
      setNames(map);
    }
    setLoading(false);
    // Mark this group read so its unread highlight clears.
    if (user?.id) supabase.from("chat_reads").upsert({ user_id: user.id, room_key: `host:${hostId}`, last_read_at: new Date().toISOString() });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
  }, [hostId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const canPost = isHostRoom || isSuperadmin || chatEnabled;

  async function send() {
    if (!text.trim() || !user?.id || !hostId) return;
    setSending(true);
    const { data, error } = await supabase.from("host_chat").insert({ host_id: hostId, author_id: user.id, content: text.trim() }).select().single();
    if (!error && data) {
      setMessages((m) => [...m, data as Msg]);
      setNames((n) => ({ ...n, [user.id]: n[user.id] ?? "You" }));
      setText("");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
    setSending(false);
  }

  async function toggleCommenting() {
    const next = !chatEnabled;
    setChatEnabled(next);
    await supabase.from("profiles").update({ chat_enabled: next }).eq("id", user!.id);
  }

  const nameFor = (aid: string) => names[aid] ?? (aid === user?.id ? "You" : "Member");

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{hostName} Group</Text>
        <View style={{ width: 50 }} />
      </View>

      {isHostRoom && (
        <TouchableOpacity style={styles.toggle} onPress={toggleCommenting}>
          <Text style={styles.toggleText}>Player commenting: <Text style={{ color: chatEnabled ? colors.green : colors.danger, fontWeight: "900" }}>{chatEnabled ? "ON" : "OFF"}</Text></Text>
          <Text style={styles.toggleHint}>{chatEnabled ? "Tap to turn off — only you can post" : "Tap to let players comment"}</Text>
        </TouchableOpacity>
      )}

      <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={{ padding: 16, flexGrow: 1 }}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.red} /></View>
        ) : messages.length === 0 ? (
          <View style={styles.center}><Text style={styles.empty}>No messages yet.</Text></View>
        ) : (
          messages.map((m) => {
            const mine = m.author_id === user?.id;
            return (
              <View key={m.id} style={[styles.bubbleWrap, mine && { alignItems: "flex-end" }]}>
                {!mine && <Text style={styles.author}>{nameFor(m.author_id)}</Text>}
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{m.content}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.inputBar}>
        {canPost ? (
          <View style={styles.inputRow}>
            <TextInput style={styles.input} placeholder="Message the group…" placeholderTextColor={colors.faint} value={text} onChangeText={setText} multiline editable={!sending} />
            <TouchableOpacity style={[styles.send, (sending || !text.trim()) && styles.sendDim]} onPress={send} disabled={sending || !text.trim()}>
              <Text style={styles.sendText}>{sending ? "…" : "Send"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.disabled}>🔒 The host has turned off commenting in this group.</Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { fontSize: 15, fontWeight: "700", color: colors.red },
  headerTitle: { fontSize: 16, fontWeight: "800", color: colors.text, flex: 1, textAlign: "center" },
  toggle: { backgroundColor: colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, paddingVertical: 10 },
  toggleText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  toggleHint: { color: colors.muted, fontSize: 11, marginTop: 2 },
  messages: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: 14, color: colors.muted },
  bubbleWrap: { marginBottom: 10, alignItems: "flex-start" },
  author: { color: colors.muted, fontSize: 11, fontWeight: "700", marginBottom: 3, marginLeft: 4 },
  bubble: { borderRadius: 16, padding: 11, maxWidth: "82%" },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleMine: { backgroundColor: colors.red },
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bubbleTextMine: { color: colors.onAccent },
  inputBar: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: 12, marginBottom: BOTTOM_NAV_HEIGHT },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  input: { flex: 1, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, fontSize: 14, color: colors.text, backgroundColor: colors.surfaceAlt, maxHeight: 110 },
  send: { backgroundColor: colors.red, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 18 },
  sendDim: { opacity: 0.45 },
  sendText: { color: colors.onAccent, fontSize: 14, fontWeight: "800" },
  disabled: { color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: 6 },
});
