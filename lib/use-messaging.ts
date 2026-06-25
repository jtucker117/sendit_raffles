import { useState } from "react";
import { supabase } from "./supabase";

export interface RaffleComment {
  id: string;
  raffle_id: string;
  author_id: string;
  author?: { display_name: string; email: string };
  content: string;
  created_at: string;
  updated_at: string;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  author_id: string;
  author?: { display_name: string; email: string };
  content: string;
  created_at: string;
  updated_at: string;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  sender?: { display_name: string; email: string };
  recipient?: { display_name: string; email: string };
  content: string;
  read_at: string | null;
  created_at: string;
}

export function useMessaging() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ===== RAFFLE COMMENTS =====
  async function fetchRaffleComments(raffleId: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("raffle_comments")
        .select("*, author:author_id(display_name, email)")
        .eq("raffle_id", raffleId)
        .order("created_at", { ascending: true });

      if (queryError) throw queryError;
      return (data as RaffleComment[]) || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch comments";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function addRaffleComment(raffleId: string, authorId: string, content: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from("raffle_comments")
        .insert([
          {
            raffle_id: raffleId,
            author_id: authorId,
            content,
          },
        ])
        .select("*, author:author_id(display_name, email)")
        .single();

      if (insertError) throw insertError;
      return data as RaffleComment;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add comment";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function updateRaffleComment(commentId: string, content: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: updateError } = await supabase
        .from("raffle_comments")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", commentId)
        .select("*, author:author_id(display_name, email)")
        .single();

      if (updateError) throw updateError;
      return data as RaffleComment;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update comment";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function deleteRaffleComment(commentId: string) {
    setLoading(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("raffle_comments")
        .delete()
        .eq("id", commentId);

      if (deleteError) throw deleteError;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete comment";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // ===== GROUP MESSAGES =====
  async function fetchGroupMessages(groupId: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("group_messages")
        .select("*, author:author_id(display_name, email)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

      if (queryError) throw queryError;
      return (data as GroupMessage[]) || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch group messages";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function addGroupMessage(groupId: string, authorId: string, content: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from("group_messages")
        .insert([
          {
            group_id: groupId,
            author_id: authorId,
            content,
          },
        ])
        .select("*, author:author_id(display_name, email)")
        .single();

      if (insertError) throw insertError;
      return data as GroupMessage;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function updateGroupMessage(messageId: string, content: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: updateError } = await supabase
        .from("group_messages")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", messageId)
        .select("*, author:author_id(display_name, email)")
        .single();

      if (updateError) throw updateError;
      return data as GroupMessage;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update message";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function deleteGroupMessage(messageId: string) {
    setLoading(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("group_messages")
        .delete()
        .eq("id", messageId);

      if (deleteError) throw deleteError;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete message";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // ===== DIRECT MESSAGES =====
  async function fetchDirectMessageThread(userId1: string, userId2: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("direct_messages")
        .select(
          "*, sender:sender_id(display_name, email), recipient:recipient_id(display_name, email)"
        )
        .or(
          `and(sender_id.eq.${userId1}, recipient_id.eq.${userId2}),and(sender_id.eq.${userId2}, recipient_id.eq.${userId1})`
        )
        .order("created_at", { ascending: true });

      if (queryError) throw queryError;
      return (data as DirectMessage[]) || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch messages";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function fetchDirectMessageConversations(userId: string) {
    setLoading(true);
    setError(null);
    try {
      // Get last message from each unique conversation
      const { data, error: queryError } = await supabase
        .from("direct_messages")
        .select(
          "*, sender:sender_id(id, display_name, email), recipient:recipient_id(id, display_name, email)"
        )
        .or(`sender_id.eq.${userId}, recipient_id.eq.${userId}`)
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      // Group by conversation and get latest message
      const conversations = new Map<
        string,
        DirectMessage & { otherUser: { id: string; display_name: string; email: string } }
      >();
      for (const msg of data || []) {
        const otherUserId = msg.sender_id === userId ? msg.recipient_id : msg.sender_id;
        const otherUser =
          msg.sender_id === userId
            ? (msg.recipient as any)
            : (msg.sender as any);
        if (!conversations.has(otherUserId)) {
          conversations.set(otherUserId, { ...msg, otherUser });
        }
      }

      return Array.from(conversations.values());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch conversations";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function sendDirectMessage(senderId: string, recipientId: string, content: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from("direct_messages")
        .insert([
          {
            sender_id: senderId,
            recipient_id: recipientId,
            content,
          },
        ])
        .select(
          "*, sender:sender_id(display_name, email), recipient:recipient_id(display_name, email)"
        )
        .single();

      if (insertError) throw insertError;
      return data as DirectMessage;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function markDirectMessageAsRead(messageId: string) {
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", messageId);

      if (updateError) throw updateError;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to mark as read";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    error,
    // Raffle comments
    fetchRaffleComments,
    addRaffleComment,
    updateRaffleComment,
    deleteRaffleComment,
    // Group messages
    fetchGroupMessages,
    addGroupMessage,
    updateGroupMessage,
    deleteGroupMessage,
    // Direct messages
    fetchDirectMessageThread,
    fetchDirectMessageConversations,
    sendDirectMessage,
    markDirectMessageAsRead,
  };
}
