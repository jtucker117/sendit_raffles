import React, { useEffect, useState } from "react";
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
import { useMessaging } from "@/lib/use-messaging";

export default function DirectMessagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
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

      <ScrollView style={styles.listContainer}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#007aff" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f2f2f7",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e5",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1c1c1e",
  },
  newButton: {
    backgroundColor: "#007aff",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  newButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  listContainer: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 15,
    color: "#8a8a8e",
    marginBottom: 16,
  },
  startButton: {
    backgroundColor: "#007aff",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  startButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  conversationCard: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e5",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  conversationContent: {
    flex: 1,
  },
  otherUserName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1c1c1e",
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 13,
    color: "#8a8a8e",
  },
  timestamp: {
    fontSize: 12,
    color: "#8a8a8e",
    marginLeft: 12,
  },
});
