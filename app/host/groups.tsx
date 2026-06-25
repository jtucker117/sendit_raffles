import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useHostGroups, HostGroup } from "@/lib/use-host-groups";

export default function HostGroupsScreen() {
  const { user, isHostApproved } = useAuth();
  const router = useRouter();
  const { fetchMyGroups, createGroup, loading, error } = useHostGroups();
  const [groups, setGroups] = useState<HostGroup[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadGroups();
  }, [user]);

  async function loadGroups() {
    if (user?.id) {
      const myGroups = await fetchMyGroups(user.id);
      setGroups(myGroups);
    }
  }

  async function handleCreateGroup() {
    if (!groupName.trim()) {
      Alert.alert("Error", "Group name is required");
      return;
    }
    if (!user?.id) return;

    setCreating(true);
    try {
      await createGroup(groupName, groupDesc, user.id);
      Alert.alert("Success", "Group created!");
      setGroupName("");
      setGroupDesc("");
      setShowCreateForm(false);
      await loadGroups();
    } catch (err) {
      Alert.alert("Error", error || "Failed to create group");
    } finally {
      setCreating(false);
    }
  }

  if (!isHostApproved) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Host Groups</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔒</Text>
          <Text style={styles.emptyText}>Your host account must be approved before managing groups.</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.screen}>
        <Text style={styles.title}>👥 Host Groups</Text>
        <Text style={styles.subtitle}>Create and manage your host organization groups</Text>

        {/* Create Group Form */}
        {showCreateForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Create New Group</Text>
            <TextInput
              style={styles.input}
              placeholder="Group name"
              placeholderTextColor="#a0a0a5"
              value={groupName}
              onChangeText={setGroupName}
              editable={!creating}
            />
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              placeholder="Group description (optional)"
              placeholderTextColor="#a0a0a5"
              value={groupDesc}
              onChangeText={setGroupDesc}
              multiline
              editable={!creating}
            />
            <View style={styles.formButtons}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setShowCreateForm(false)}
                disabled={creating}
              >
                <Text style={styles.buttonTextSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, creating && styles.buttonDisabled]}
                onPress={handleCreateGroup}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Create Group</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Create Button */}
        {!showCreateForm && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => setShowCreateForm(true)}
          >
            <Text style={styles.createButtonText}>+ Create New Group</Text>
          </TouchableOpacity>
        )}

        {/* Groups List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007aff" />
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No groups yet. Create one to get started!</Text>
          </View>
        ) : (
          <View style={styles.groupsList}>
            {groups.map((group) => (
              <TouchableOpacity
                key={group.id}
                style={styles.groupCard}
                onPress={() => router.push(`/host/group/${group.id}`)}
              >
                <View style={styles.groupHeader}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  <Text style={styles.groupMeta}>→</Text>
                </View>
                {group.description && (
                  <Text style={styles.groupDesc}>{group.description}</Text>
                )}
                <Text style={styles.groupDate}>
                  Created {new Date(group.created_at).toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
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
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1c1c1e",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#8a8a8e",
    marginBottom: 24,
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e0e0e5",
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1c1c1e",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d1d6",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#1c1c1e",
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  formButtons: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#007aff",
  },
  buttonSecondary: {
    backgroundColor: "#e0e0e5",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonTextSecondary: {
    color: "#1c1c1e",
    fontSize: 15,
    fontWeight: "600",
  },
  createButton: {
    backgroundColor: "#007aff",
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 20,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  groupsList: {
    gap: 12,
  },
  groupCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e0e0e5",
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  groupName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1c1c1e",
  },
  groupMeta: {
    fontSize: 18,
    color: "#007aff",
  },
  groupDesc: {
    fontSize: 13,
    color: "#555",
    marginBottom: 8,
  },
  groupDate: {
    fontSize: 12,
    color: "#8a8a8e",
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#8a8a8e",
    textAlign: "center",
    maxWidth: 240,
  },
  errorBox: {
    backgroundColor: "#ff3b30",
    borderRadius: 12,
    padding: 12,
    marginTop: 20,
  },
  errorText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
