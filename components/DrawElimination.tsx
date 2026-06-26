// Multi-round elimination reveal. The winner + each round's eliminated seats are
// already decided server-side by Random.org (one signed draw per round). This
// just replays them: seats drop out round by round until the winner remains.
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/lib/theme-context";
import { radius, AppColors } from "@/lib/theme";

export interface ElimRound { eliminated: number[] }

export function DrawElimination({
  entrants, rounds, winnerSeat, onDone,
}: { entrants: { seat: number; name: string }[]; rounds: ElimRound[]; winnerSeat: number; onDone?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [eliminated, setEliminated] = useState<Set<number>>(new Set());
  const [roundNo, setRoundNo] = useState(0);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    const elim = new Set<number>();
    let i = 0;
    const tick = () => {
      if (i >= rounds.length) {
        if (!doneRef.current) { doneRef.current = true; setDone(true); setTimeout(() => onDone?.(), 1000); }
        return;
      }
      rounds[i].eliminated.forEach((s) => elim.add(s));
      setEliminated(new Set(elim));
      setRoundNo(i + 1);
      i++;
      timer = setTimeout(tick, 1300);
    };
    let timer = setTimeout(tick, 700);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = entrants.length - eliminated.size;

  return (
    <View style={styles.wrap}>
      <Text style={styles.status}>
        {done ? "🏆 LAST ONE STANDING" : roundNo === 0 ? "Last man standing…" : `Round ${roundNo} of ${rounds.length} · ${remaining} left`}
      </Text>
      <View style={styles.grid}>
        {entrants.map((e) => {
          const out = eliminated.has(e.seat);
          const win = done && e.seat === winnerSeat;
          return (
            <View key={e.seat} style={[styles.seat, out && styles.seatOut, win && styles.seatWin]}>
              <Text style={[styles.seatNum, out && styles.seatNumOut, win && styles.seatNumWin]}>{e.seat}</Text>
            </View>
          );
        })}
      </View>
      {done && <Text style={styles.note}>Last seat standing — decided over {rounds.length} signed Random.org round{rounds.length === 1 ? "" : "s"}.</Text>}
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  wrap: { width: "100%", alignItems: "center" },
  status: { color: colors.red, fontSize: 13, fontWeight: "900", letterSpacing: 1.5, marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 7, justifyContent: "center" },
  seat: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  seatOut: { opacity: 0.25 },
  seatWin: { backgroundColor: colors.red, borderColor: colors.red, transform: [{ scale: 1.12 }] },
  seatNum: { color: colors.text, fontSize: 13, fontWeight: "800" },
  seatNumOut: { textDecorationLine: "line-through", color: colors.faint },
  seatNumWin: { color: colors.onAccent },
  note: { color: colors.muted, fontSize: 12, marginTop: 14, textAlign: "center" },
});
