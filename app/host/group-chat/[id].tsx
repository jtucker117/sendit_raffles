import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useMessaging, GroupMessage } from "@/lib/use-messaging";

export default function GroupChatScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { fetchGroupMessages, addGroupMessage, loading, error } = useMessaging();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (id && typeof id === "string") {
      loadMessages();
    }
  }, [id]);

  async function loadMessages() {
    if (!id || typeof id !== "string") return;
    const loaded = await fetchGroupMessages(id);
    setMessages(loaded);
  }

  async function handleSendMessage() {
    if (!newMessage.trim() || !user?.id || !id || typeof id !== "string") return;

    setSending(true);
    try {
      const msg = await addGroupMessage(id, user.id, newMessage);
      setMessages([...messages, msg]);
      setNewMessage("");
    } catch (err) {
      // Error already set in hook
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>💬 Group Chat</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Messages */}
      <ScrollView style={styles.messagesContainer}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#007aff" />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No messages yet. Start a conversation!</Text>
          </View>
        ) : (
          messages.map((msg) => (
            <View
              key={msg.id}
              style={[styles.messageCard, msg.author_id === user?.id && styles.ownMessage]}
            >
              {msg.author_id !== user?.id && (
                <Text style={styles.authorName}>{msg.author?.display_name || "Unknown"}</Text>
              )}
              <Text style={[styles.messageContent, msg.author_id === user?.id && styles.ownContent]}>
                {msg.content}
              </Text>
              <Text style={styles.timestamp}>
                {new Date(msg.created_at).toLocaleTimeString()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputContainer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            placeholderTextColor="#a0a0a5"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendButton, (sending || !newMessage.trim()) && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={sending || !newMessage.trim()}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e5",
  },
  backButton: {
    fontSize: 15,
    fontWeight: "600",
    color: "#007aff",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1c1c1e",
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#8a8a8e",
  },
  messageCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    maxWidth: "85%",
    borderWidth: 1,
    borderColor: "#e0e0e5",
  },
  ownMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#007aff",
    borderColor: "#007aff",
  },
  authorName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#007aff",
    marginBottom: 4,
  },
  messageContent: {
    fontSize: 14,
    color: "#1c1c1e",
    lineHeight: 20,
  },
  ownContent: {
    color: "#fff",
  },
  timestamp: {
    fontSize: 11,
    color: "#8a8a8e",
    marginTop: 6,
  },
  inputContainer: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e5",
    padding: 12,
  },
  errorText: {
    color: "#ff3b30",
    fontSize: 11,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d1d6",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#1c1c1e",
    backgroundColor: "#f2f2f7",
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: "#007aff",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
