// Scratch-off winner reveal. The winner is already decided by Random.org —
// this just hides it under a foil the host taps to scratch away.
import { useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/lib/theme-context";
import { radius, AppColors } from "@/lib/theme";

export function DrawScratch({
  winnerName, winnerSeat, onDone,
}: { winnerName: string; winnerSeat: number; onDone?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const cover = useRef(new Animated.Value(1)).current;
  const [revealed, setRevealed] = useState(false);

  function scratch() {
    if (revealed) return;
    setRevealed(true);
    Animated.timing(cover, { toValue: 0, duration: 700, useNativeDriver: false }).start(() => onDone?.());
  }

  return (
    <View style={styles.card}>
      {/* Prize / winner underneath */}
      <View style={styles.prize}>
        <Text style={styles.eyebrow}>WINNER</Text>
        <Text style={styles.name} numberOfLines={2}>{winnerName}</Text>
        <Text style={styles.seat}>Seat #{winnerSeat}</Text>
      </View>

      {/* Foil cover */}
      <Animated.View pointerEvents={revealed ? "none" : "auto"} style={[StyleSheet.absoluteFill, { opacity: cover }]}>
        <TouchableOpacity activeOpacity={0.9} style={StyleSheet.absoluteFill} onPress={scratch}>
          <LinearGradient colors={["#3a3d45", "#1b1d24", "#3a3d45"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.foil}>
            <Text style={styles.foilTitle}>Scratch to reveal</Text>
            <Text style={styles.foilSub}>tap the card</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  card: { width: "100%", height: 200, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  prize: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 16 },
  eyebrow: { color: colors.red, fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  name: { color: colors.text, fontSize: 30, fontWeight: "900", marginTop: 8, textAlign: "center" },
  seat: { color: colors.muted, fontSize: 14, marginTop: 4 },
  foil: { flex: 1, alignItems: "center", justifyContent: "center" },
  foilTitle: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 0.5 },
  foilSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 4 },
});
