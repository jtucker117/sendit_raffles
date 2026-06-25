import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";

export default function Home() {
  const { user, loading, signOut, isHostApproved, isHostPending, isHostRejected } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator size="large" color="#007aff" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.screen}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>SR</Text>
        </View>
        <Text style={styles.title}>Send It Raffles</Text>
        <Text style={styles.tag}>Provably-fair draws</Text>
        <Text style={styles.note}>Milestone 1 — app scaffold is live. Auth and the seat board come next.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>SR</Text>
          </View>
          <Text style={styles.title}>Send It Raffles</Text>
          <Text style={styles.subtitle}>{user.role === "host" ? "🎡 Host" : "🎫 Player"}</Text>
        </View>

        {/* User Card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Signed in as</Text>
          <Text style={styles.displayName}>{user.display_name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        {/* Host Approval Status */}
        {user.role === "host" && (
          <View style={[
            styles.statusCard,
            isHostApproved ? styles.statusApproved : isHostRejected ? styles.statusRejected : styles.statusPending
          ]}>
            {isHostPending && (
              <>
                <Text style={styles.statusIcon}>⏳</Text>
                <Text style={styles.statusTitle}>Approval Pending</Text>
                <Text style={styles.statusMessage}>
                  Your host account is under review. You'll be able to create raffles once approved.
                </Text>
              </>
            )}
            {isHostApproved && (
              <>
                <Text style={styles.statusIcon}>✅</Text>
                <Text style={styles.statusTitle}>Host Approved</Text>
                <Text style={styles.statusMessage}>
                  You're ready to create raffles and manage host groups.
                </Text>
              </>
            )}
            {isHostRejected && (
              <>
                <Text style={styles.statusIcon}>❌</Text>
                <Text style={styles.statusTitle}>Application Rejected</Text>
                <Text style={styles.statusMessage}>
                  Your host application was not approved. Please contact support for more information.
                </Text>
              </>
            )}
          </View>
        )}

        {/* Action Buttons */}
        {user.role === "host" && isHostApproved && (
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => router.push("/host/groups")}
            >
              <Text style={styles.actionButtonText}>👥 Manage Groups</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => router.push("/host/create-raffle")}
            >
              <Text style={styles.actionButtonText}>🎡 Create Raffle</Text>
            </TouchableOpacity>
          </View>
        )}

        {user.role === "player" && (
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => router.push("/player/browse")}
            >
              <Text style={styles.actionButtonText}>🎫 Browse Raffles</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Next Steps */}
        <View style={styles.cardContent}>
          <Text style={styles.nextSteps}>What's next:</Text>
          {user.role === "host" ? (
            <>
              <Text style={styles.nextItem}>• {isHostPending ? "Wait for approval" : "Create a raffle"}</Text>
              <Text style={styles.nextItem}>• Join or create a host group</Text>
              <Text style={styles.nextItem}>• Configure seat board and pricing</Text>
              <Text style={styles.nextItem}>• Run draws with Random.org verification</Text>
            </>
          ) : (
            <>
              <Text style={styles.nextItem}>• Browse available raffles</Text>
              <Text style={styles.nextItem}>• Purchase or claim free seats</Text>
              <Text style={styles.nextItem}>• Watch the wheel spin live</Text>
              <Text style={styles.nextItem}>• Verify winners on Random.org</Text>
            </>
          )}
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const COLORS = {
  bg: "#0a0a0c",
  ink: "#f3f4f6",
  muted: "#9aa0a6",
  red: "#e6232f",
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f2f2f7",
  },
  screen: {
    alignItems: "center",
    backgroundColor: "#f2f2f7",
    padding: 24,
    paddingTop: 40,
    paddingBottom: 60,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#007aff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  logoText: { color: "#fff", fontSize: 26, fontWeight: "800" },
  title: { fontSize: 28, fontWeight: "800", color: "#1c1c1e", letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: "#8a8a8e", marginTop: 4 },
  tag: { fontSize: 15, color: "#8a8a8e" },
  note: { fontSize: 13, color: "#8a8a8e", textAlign: "center", marginTop: 16, maxWidth: 320 },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e0e0e5",
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8a8a8e",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  displayName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1c1c1e",
    marginBottom: 4,
  },
  email: {
    fontSize: 13,
    color: "#8a8a8e",
  },
  statusCard: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    alignItems: "center",
    borderWidth: 1,
  },
  statusPending: {
    backgroundColor: "#fff3cd",
    borderColor: "#ffc107",
  },
  statusApproved: {
    backgroundColor: "#d4edda",
    borderColor: "#28a745",
  },
  statusRejected: {
    backgroundColor: "#f8d7da",
    borderColor: "#dc3545",
  },
  statusIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1c1c1e",
    marginBottom: 6,
  },
  statusMessage: {
    fontSize: 13,
    color: "#555",
    textAlign: "center",
    lineHeight: 20,
  },
  actionButtons: {
    width: "100%",
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: "#007aff",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  cardContent: {
    width: "100%",
    backgroundColor: "#007aff15",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  nextSteps: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1c1c1e",
    marginBottom: 10,
  },
  nextItem: {
    fontSize: 12,
    color: "#555",
    lineHeight: 20,
    marginBottom: 6,
  },
  signOutButton: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#d1d1d6",
    backgroundColor: "#fff",
  },
  signOutText: {
    color: "#1c1c1e",
    fontSize: 15,
    fontWeight: "600",
  },
});

