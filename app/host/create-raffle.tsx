import { View, Text, StyleSheet } from "react-native";

export default function CreateRaffleScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>🎡 Create Raffle</Text>
      <Text style={styles.placeholder}>Coming soon...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f2f2f7",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 12,
  },
  placeholder: {
    fontSize: 15,
    color: "#8a8a8e",
  },
});
