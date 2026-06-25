import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useHostGroups, GroupMember } from "@/lib/use-host-groups";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { fetchGroupMembers, loading } = useHostGroups();
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    if (id && typeof id === "string") {
      loadMembers();
    }
  }, [id]);

  async function loadMembers() {
    if (!id || typeof id !== "string") return;
    const groupMembers = await fetchGroupMembers(id);
    setMembers(groupMembers);
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.screen}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Group Details</Text>

        {/* Chat Button */}
        {id && typeof id === "string" && (
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => router.push(`/host/group-chat/${id}`)}
          >
            <Text style={styles.chatButtonText}>💬 Open Group Chat</Text>
          </TouchableOpacity>
        )}

        {/* Members Section */}
        <Text style={styles.subtitle}>Group Members ({members.length})</Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007aff" />
          </View>
        ) : (
          <View style={styles.membersList}>
            {members.map((member) => (
              <View key={member.id} style={styles.memberCard}>
                <View>
                  <Text style={styles.memberName}>{member.profiles?.display_name}</Text>
                  <Text style={styles.memberEmail}>{member.profiles?.email}</Text>
                </View>
                <View style={styles.memberMeta}>
                  <Text style={styles.memberRole}>{member.role}</Text>
                  {member.host_id !== user?.id && (
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: "/messages/chat/[id]",
                          params: { id: member.host_id },
                        })
                      }
                    >
                      <Text style={styles.dmButton}>💬</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f2f2f7",
  },
  screen: {
    padding: 24,
    paddingTop: 40,
    paddingBottom: 60,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#007aff",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1c1c1e",
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  chatButton: {
    backgroundColor: "#007aff",
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 24,
  },
  chatButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 15,
    color: "#8a8a8e",
    marginBottom: 16,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  membersList: {
    gap: 10,
  },
  memberCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e5",
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1c1c1e",
  },
  memberEmail: {
    fontSize: 12,
    color: "#8a8a8e",
    marginTop: 2,
  },
  memberMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberRole: {
    fontSize: 12,
    fontWeight: "600",
    color: "#007aff",
    textTransform: "capitalize",
  },
  dmButton: {
    fontSize: 18,
  },
});
