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
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

export default function NewMessageScreen() {
  const router = useRouter();
  const { user, isSuperadmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, [user?.id]);

  useEffect(() => {
    if (search.trim()) {
      const filtered = users.filter((u) =>
        u.display_name?.toLowerCase().includes(search.toLowerCase()) ||
        (isSuperadmin && u.email?.toLowerCase().includes(search.toLowerCase()))
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers(users);
    }
  }, [search, users]);

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(isSuperadmin ? "id, display_name, email" : "id, display_name")
        .neq("id", user?.id)
        .order("display_name");

      if (error) throw error;
      setUsers(data || []);
      setFilteredUsers(data || []);
    } catch (err) {
      console.error("Error loading users:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectUser(userId: string) {
    router.push({
      pathname: "/messages/chat/[id]",
      params: { id: userId },
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Message</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search users..."
          placeholderTextColor="#a0a0a5"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Users List */}
      <ScrollView style={styles.listContainer}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#007aff" />
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              {search ? "No users found" : "No users available"}
            </Text>
          </View>
        ) : (
          filteredUsers.map((u) => (
            <TouchableOpacity
              key={u.id}
              style={styles.userCard}
              onPress={() => handleSelectUser(u.id)}
            >
              <View>
                <Text style={styles.userName}>{u.display_name}</Text>
                {isSuperadmin && u.email ? <Text style={styles.userEmail}>{u.email}</Text> : null}
              </View>
              <Text style={styles.arrow}>→</Text>
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
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1c1c1e",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e5",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#d1d1d6",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#1c1c1e",
    backgroundColor: "#f2f2f7",
  },
  listContainer: {
    flex: 1,
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
  userCard: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e5",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  userName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1c1c1e",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 13,
    color: "#8a8a8e",
  },
  arrow: {
    fontSize: 18,
    color: "#007aff",
  },
});
