import { View, Text, Image, StyleSheet } from "react-native";

export default function Home() {
  return (
    <View style={styles.screen}>
      <Image source={require("../assets/logo.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.tag}>Provably-fair raffles</Text>
      <View style={styles.rule} />
      <Text style={styles.note}>Milestone 1 — app scaffold is live. Logins and the seat board come next.</Text>
    </View>
  );
}

const COLORS = {
  bg: "#0a0a0c",
  ink: "#f3f4f6",
  muted: "#9aa0a6",
  red: "#e6232f",
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
    padding: 24,
  },
  logo: { width: 200, height: 200, marginBottom: 8 },
  tag: { fontSize: 15, color: COLORS.muted, letterSpacing: 0.3 },
  rule: { width: 48, height: 3, borderRadius: 2, backgroundColor: COLORS.red, marginVertical: 18 },
  note: { fontSize: 13, color: COLORS.muted, textAlign: "center", maxWidth: 320, lineHeight: 19 },
});
