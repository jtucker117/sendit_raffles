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
import { useAuth } from "@/lib/auth-context";
import { useMessaging, RaffleComment } from "@/lib/use-messaging";

interface RaffleChatProps {
  raffleId: string;
  title?: string;
}

export function RaffleChat({ raffleId, title = "Game Chat" }: RaffleChatProps) {
  const { user } = useAuth();
  const { fetchRaffleComments, addRaffleComment, loading, error } = useMessaging();
  const [comments, setComments] = useState<RaffleComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadComments();
  }, [raffleId]);

  async function loadComments() {
    const loaded = await fetchRaffleComments(raffleId);
    setComments(loaded);
  }

  async function handleSendComment() {
    if (!newComment.trim() || !user?.id) return;

    setSending(true);
    try {
      const comment = await addRaffleComment(raffleId, user.id, newComment);
      setComments([...comments, comment]);
      setNewComment("");
    } catch (err) {
      // Error already set in hook
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      {/* Messages List */}
      <ScrollView style={styles.messagesContainer}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#007aff" />
          </View>
        ) : comments.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No comments yet. Be the first!</Text>
          </View>
        ) : (
          comments.map((comment) => (
            <View key={comment.id} style={styles.messageCard}>
              <View style={styles.messageHeader}>
                <Text style={styles.authorName}>
                  {comment.author?.display_name || "Unknown"}
                </Text>
                <Text style={styles.timestamp}>
                  {new Date(comment.created_at).toLocaleTimeString()}
                </Text>
              </View>
              <Text style={styles.messageContent}>{comment.content}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Input Field */}
      {user && (
        <View style={styles.inputContainer}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Add a comment..."
              placeholderTextColor="#a0a0a5"
              value={newComment}
              onChangeText={setNewComment}
              multiline
              editable={!sending}
            />
            <TouchableOpacity
              style={[styles.sendButton, (sending || !newComment.trim()) && styles.sendButtonDisabled]}
              onPress={handleSendComment}
              disabled={sending || !newComment.trim()}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f2f2f7",
    borderRadius: 16,
    overflow: "hidden",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1c1c1e",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e5",
  },
  messagesContainer: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#8a8a8e",
  },
  messageCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e0e0e5",
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  authorName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1c1c1e",
  },
  timestamp: {
    fontSize: 11,
    color: "#8a8a8e",
  },
  messageContent: {
    fontSize: 13,
    color: "#333",
    lineHeight: 18,
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
