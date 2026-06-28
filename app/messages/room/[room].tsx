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

// Permanent platform rooms: "everyone" (all users) and "hosts" (hosts + creator).
export default function PlatformRoomChat() {
  const { room } = useLocalSearchParams<{ room: string }>();
  const router = useRouter();
  const { user, isSuperadmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const isHosts = room === "hosts";
  const title = isHosts ? "Hosts" : "Community";
  const isHostOrAdmin = user?.role === "host" || isSuperadmin;
  const canPost = !isHosts || isHostOrAdmin;

  const load = useCallback(async () => {
    if (!room) return;
    const { data: msgs } = await supabase.from("platform_chat").select("id, author_id, content, created_at").eq("room", room).order("created_at");
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
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
  }, [room]);

  useEffect(() => { load(); }, [load]);

  async function send() {
    if (!text.trim() || !user?.id || !room) return;
    setSending(true);
    const { data, error } = await supabase.from("platform_chat").insert({ room, author_id: user.id, content: text.trim() }).select().single();
    if (!error && data) {
      setMessages((m) => [...m, data as Msg]);
      setNames((n) => ({ ...n, [user.id]: n[user.id] ?? "You" }));
      setText("");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
    setSending(false);
  }

  const nameFor = (aid: string) => names[aid] ?? (aid === user?.id ? "You" : "Member");

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 50 }} />
      </View>

      <Text style={styles.banner}>
        {isHosts ? "🛡️ Hosts & creator only — coordinate with the team." : "💬 Everyone's room — players & hosts. Be cool."}
      </Text>

      <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={{ padding: 16, flexGrow: 1 }}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.red} /></View>
        ) : messages.length === 0 ? (
          <View style={styles.center}><Text style={styles.empty}>No messages yet. Say hi 👋</Text></View>
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
            <TextInput style={styles.input} placeholder={`Message ${title}…`} placeholderTextColor={colors.faint} value={text} onChangeText={setText} multiline editable={!sending} />
            <TouchableOpacity style={[styles.send, (sending || !text.trim()) && styles.sendDim]} onPress={send} disabled={sending || !text.trim()}>
              <Text style={styles.sendText}>{sending ? "…" : "Send"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.disabled}>🔒 Only hosts and the creator can post here.</Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { color: colors.red, fontSize: 15, fontWeight: "700" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: colors.text, flex: 1, textAlign: "center" },
  banner: { color: colors.muted, fontSize: 12.5, textAlign: "center", paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.surfaceAlt },
  messages: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  empty: { color: colors.muted, fontSize: 14 },
  bubbleWrap: { marginBottom: 12 },
  author: { color: colors.muted, fontSize: 11, fontWeight: "700", marginBottom: 3, marginLeft: 4 },
  bubble: { maxWidth: "82%", borderRadius: radius.lg, paddingHorizontal: 13, paddingVertical: 9 },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start" },
  bubbleMine: { backgroundColor: colors.red, alignSelf: "flex-end" },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 19 },
  bubbleTextMine: { color: colors.onAccent },
  inputBar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, padding: 12, marginBottom: BOTTOM_NAV_HEIGHT },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  input: { flex: 1, backgroundColor: colors.surfaceAlt, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14, maxHeight: 110 },
  send: { backgroundColor: colors.red, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 11 },
  sendDim: { opacity: 0.5 },
  sendText: { color: colors.onAccent, fontWeight: "800", fontSize: 14 },
  disabled: { color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: 6 },
});
