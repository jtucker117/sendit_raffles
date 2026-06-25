import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useMessaging } from "@/lib/use-messaging";
import { radius, AppColors } from "@/lib/theme";
import { BottomNav, BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

export default function DirectMessagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { fetchDirectMessageConversations, loading } = useMessaging();
  const [conversations, setConversations] = useState<any[]>([]);

  useEffect(() => {
    loadConversations();
  }, [user?.id]);

  async function loadConversations() {
    if (!user?.id) return;
    const convos = await fetchDirectMessageConversations(user.id);
    setConversations(convos);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>💬 Direct Messages</Text>
        <TouchableOpacity style={styles.newButton} onPress={() => router.push("/messages/new")}>
          <Text style={styles.newButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.listContainer} contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.red} />
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No messages yet</Text>
            <TouchableOpacity style={styles.startButton} onPress={() => router.push("/messages/new")}>
              <Text style={styles.startButtonText}>Start a conversation</Text>
            </TouchableOpacity>
          </View>
        ) : (
          conversations.map((convo) => (
            <TouchableOpacity
              key={convo.otherUser.id}
              style={styles.conversationCard}
              onPress={() =>
                router.push({
                  pathname: "/messages/chat/[id]",
                  params: { id: convo.otherUser.id },
                })
              }
            >
              <View style={styles.conversationContent}>
                <Text style={styles.otherUserName}>{convo.otherUser.display_name}</Text>
                <Text style={styles.lastMessage} numberOfLines={1}>
                  {convo.sender_id === user?.id ? "You: " : ""}{convo.content}
                </Text>
              </View>
              <Text style={styles.timestamp}>
                {new Date(convo.created_at).toLocaleTimeString()}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  newButton: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 14 },
  newButtonText: { color: colors.onAccent, fontSize: 13, fontWeight: "700" },
  listContainer: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingTop: 60 },
  emptyText: { fontSize: 15, color: colors.muted, marginBottom: 16 },
  startButton: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 20 },
  startButtonText: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
  conversationCard: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  conversationContent: { flex: 1 },
  otherUserName: { fontSize: 15, fontWeight: "600", color: colors.text, marginBottom: 4 },
  lastMessage: { fontSize: 13, color: colors.muted },
  timestamp: { fontSize: 12, color: colors.faint, marginLeft: 12 },
});
