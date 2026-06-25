// Lotto ball-pull winner reveal. The winning seat is already decided by
// Random.org — the balls shuffle digits, then lock left→right onto that number.
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/lib/theme-context";
import { radius, AppColors } from "@/lib/theme";

export function DrawLotto({
  winnerSeat, capacity, onDone,
}: { winnerSeat: number; capacity: number; onDone?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const width = Math.max(String(capacity).length, 2);
  const target = useMemo(() => String(winnerSeat).padStart(width, "0").split(""), [winnerSeat, width]);

  const [digits, setDigits] = useState<string[]>(() => target.map(() => "0"));
  const lockedRef = useRef<boolean[]>(target.map(() => false));
  const [locked, setLocked] = useState<boolean[]>(target.map(() => false));

  useEffect(() => {
    const iv = setInterval(() => {
      setDigits((prev) => prev.map((d, i) => (lockedRef.current[i] ? target[i] : String(Math.floor(Math.random() * 10)))));
    }, 80);
    const timers = target.map((_, i) =>
      setTimeout(() => {
        lockedRef.current[i] = true;
        setLocked([...lockedRef.current]);
        if (i === target.length - 1) {
          clearInterval(iv);
          setTimeout(() => onDone?.(), 600);
        }
      }, 900 + i * 550),
    );
    return () => { clearInterval(iv); timers.forEach(clearTimeout); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>WINNING SEAT</Text>
      <View style={styles.row}>
        {digits.map((d, i) => (
          <View key={i} style={[styles.ball, locked[i] && styles.ballLocked]}>
            <Text style={[styles.digit, locked[i] && styles.digitLocked]}>{d}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 8 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 2, marginBottom: 14 },
  row: { flexDirection: "row", gap: 10 },
  ball: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  ballLocked: { backgroundColor: colors.red, borderColor: colors.red },
  digit: { color: colors.muted, fontSize: 26, fontWeight: "900" },
  digitLocked: { color: colors.onAccent },
});
