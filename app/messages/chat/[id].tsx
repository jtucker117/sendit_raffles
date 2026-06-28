import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useMessaging } from "@/lib/use-messaging";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

export default function DirectMessageChatScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { fetchDirectMessageThread, sendDirectMessage, error } = useMessaging();

  const [messages, setMessages] = useState<any[]>([]);
  const [otherUserName, setOtherUserName] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const otherId = typeof id === "string" ? id : "";

  const loadMessages = useCallback(async () => {
    if (!otherId || !user?.id) return;
    const loaded = await fetchDirectMessageThread(user.id, otherId);
    setMessages(loaded);
    setLoading(false);
    // Mark their messages to me as read so the unread badge clears.
    supabase.from("direct_messages").update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id).eq("sender_id", otherId).is("read_at", null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
  }, [otherId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // name even when the thread is empty
    if (otherId) supabase.from("profiles").select("display_name").eq("id", otherId).maybeSingle().then(({ data }) => setOtherUserName(data?.display_name ?? "User"));
    loadMessages();
  }, [otherId, loadMessages]);

  async function handleSend() {
    if (!newMessage.trim() || !user?.id || !otherId) return;
    setSending(true);
    try {
      const msg = await sendDirectMessage(user.id, otherId, newMessage.trim());
      if (msg) setMessages((m) => [...m, msg]);
      setNewMessage("");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch {} finally { setSending(false); }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{otherUserName}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={{ padding: 16, flexGrow: 1 }}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.red} /></View>
        ) : messages.length === 0 ? (
          <View style={styles.center}><Text style={styles.empty}>Say hi to {otherUserName} 👋</Text></View>
        ) : (
          messages.map((msg) => {
            const mine = msg.sender_id === user?.id;
            return (
              <View key={msg.id} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{msg.content}</Text>
                <Text style={[styles.time, mine && styles.timeMine]}>{new Date(msg.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.inputBar}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Message…"
            placeholderTextColor={colors.faint}
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            editable={!sending}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity style={[styles.send, (sending || !newMessage.trim()) && styles.sendDim]} onPress={handleSend} disabled={sending || !newMessage.trim()}>
            <Text style={styles.sendText}>{sending ? "…" : "Send"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { fontSize: 15, fontWeight: "700", color: colors.red },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, flex: 1, textAlign: "center" },
  messages: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: 14, color: colors.muted },
  bubble: { borderRadius: 16, padding: 11, marginBottom: 10, maxWidth: "82%" },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start" },
  bubbleMine: { backgroundColor: colors.red, alignSelf: "flex-end" },
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bubbleTextMine: { color: colors.onAccent },
  time: { fontSize: 10, color: colors.faint, marginTop: 5 },
  timeMine: { color: colors.onAccent, opacity: 0.75 },
  // input sits ABOVE the bottom tab bar
  inputBar: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: 12, marginBottom: BOTTOM_NAV_HEIGHT },
  errorText: { color: colors.danger, fontSize: 11, marginBottom: 8 },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  input: { flex: 1, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, fontSize: 14, color: colors.text, backgroundColor: colors.surfaceAlt, maxHeight: 110 },
  send: { backgroundColor: colors.red, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  sendDim: { opacity: 0.45 },
  sendText: { color: colors.onAccent, fontSize: 14, fontWeight: "800" },
});
