import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Image } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import { colors, radius } from "@/lib/theme";

const LOGO = require("../assets/logo.png");

export default function Home() {
  const { user, loading, signOut, isHostApproved, isHostPending, isHostRejected } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator size="large" color={colors.red} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.screen}>
        <Image source={LOGO} style={styles.bigLogo} resizeMode="contain" />
        <Text style={styles.tag}>Provably-fair raffles</Text>
        <View style={styles.rule} />
        <Text style={styles.note}>Milestone 1 — app scaffold is live. Sign in to continue.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <Text style={styles.subtitle}>{user.role === "host" ? "🎡 Host" : "🎫 Player"}</Text>
      </View>

      {/* User card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Signed in as</Text>
        <Text style={styles.displayName}>{user.display_name}</Text>
        <Text style={styles.email}>{user.email}</Text>
      </View>

      <TouchableOpacity style={styles.profileButton} onPress={() => router.push("/profile")}>
        <Text style={styles.profileButtonText}>🪪 My Profile</Text>
      </TouchableOpacity>

      {/* Host approval status */}
      {user.role === "host" && (
        <View style={[
          styles.statusCard,
          isHostApproved ? styles.statusApproved : isHostRejected ? styles.statusRejected : styles.statusPending,
        ]}>
          {isHostPending && (
            <>
              <Text style={styles.statusIcon}>⏳</Text>
              <Text style={styles.statusTitle}>Approval Pending</Text>
              <Text style={styles.statusMessage}>Your host account is under review. You'll be able to create raffles once approved.</Text>
            </>
          )}
          {isHostApproved && (
            <>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusTitle}>Host Approved</Text>
              <Text style={styles.statusMessage}>You're ready to create raffles and manage host groups.</Text>
            </>
          )}
          {isHostRejected && (
            <>
              <Text style={styles.statusIcon}>❌</Text>
              <Text style={styles.statusTitle}>Application Rejected</Text>
              <Text style={styles.statusMessage}>Your host application was not approved. Please contact support for more information.</Text>
            </>
          )}
        </View>
      )}

      {/* Action buttons */}
      {user.role === "host" && isHostApproved && (
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/host/groups")}>
            <Text style={styles.actionButtonText}>👥 Manage Groups</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/host/create-raffle")}>
            <Text style={styles.actionButtonText}>🎡 Create Raffle</Text>
          </TouchableOpacity>
        </View>
      )}

      {user.role === "player" && (
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/player/browse")}>
            <Text style={styles.actionButtonText}>🎫 Browse Raffles</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Next steps */}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 48, paddingBottom: 60, alignItems: "center" },
  screen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: 24 },
  bigLogo: { width: 200, height: 200, marginBottom: 8 },
  logo: { width: 96, height: 96 },
  tag: { fontSize: 15, color: colors.muted, letterSpacing: 0.3 },
  rule: { width: 48, height: 3, borderRadius: 2, backgroundColor: colors.red, marginVertical: 18 },
  note: { fontSize: 13, color: colors.muted, textAlign: "center", maxWidth: 320, lineHeight: 19 },
  header: { alignItems: "center", marginBottom: 24 },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 6 },
  card: { width: "100%", backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  cardLabel: { fontSize: 12, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  displayName: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 4 },
  email: { fontSize: 13, color: colors.muted },
  statusCard: { width: "100%", borderRadius: radius.lg, padding: 16, marginBottom: 20, alignItems: "center", borderWidth: 1 },
  statusPending: { backgroundColor: colors.amberSoft, borderColor: colors.amber },
  statusApproved: { backgroundColor: colors.greenSoft, borderColor: colors.green },
  statusRejected: { backgroundColor: colors.redSoft, borderColor: colors.red },
  statusIcon: { fontSize: 40, marginBottom: 8 },
  statusTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 6 },
  statusMessage: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 20 },
  actionButtons: { width: "100%", gap: 10, marginBottom: 16 },
  actionButton: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 15, alignItems: "center" },
  actionButtonText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  cardContent: { width: "100%", backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  nextSteps: { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: 10 },
  nextItem: { fontSize: 14, color: colors.muted, lineHeight: 24 },
  profileButton: { width: "100%", borderRadius: radius.md, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: colors.red, marginBottom: 16 },
  profileButtonText: { color: colors.red, fontSize: 15, fontWeight: "700" },
  signOutButton: { width: "100%", borderRadius: radius.md, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  signOutText: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
