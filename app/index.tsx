import { View, Text, StyleSheet } from "react-native";

export default function Home() {
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f2f2f7",
    padding: 24,
    gap: 8,
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
  tag: { fontSize: 15, color: "#8a8a8e" },
  note: { fontSize: 13, color: "#8a8a8e", textAlign: "center", marginTop: 16, maxWidth: 320 },
});
