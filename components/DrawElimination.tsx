// Last-man-standing reveal. The winner + each round's eliminated seats are
// already decided server-side by Random.org (one signed draw per round). This
// replays them slowly: each round, the eliminated seats grow + shake (a tease)
// then fade away, until one seat is left standing.
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { useTheme } from "@/lib/theme-context";
import { radius, AppColors } from "@/lib/theme";

export interface ElimRound { eliminated: number[] }

const ROUND_MS = 2400;   // pause between rounds (slow enough to follow the tease)
const START_MS = 1000;

export function DrawElimination({
  entrants, rounds, winnerSeat, onDone,
}: { entrants: { seat: number; name: string }[]; rounds: ElimRound[]; winnerSeat: number; onDone?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [eliminated, setEliminated] = useState<Set<number>>(new Set());
  const [teasing, setTeasing] = useState<Set<number>>(new Set()); // seats mid grow/shake
  const [roundNo, setRoundNo] = useState(0);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

  // per-seat animated values: opacity, scale, shake (translateX)
  const anim = useRef<Record<number, { op: Animated.Value; sc: Animated.Value; tx: Animated.Value }>>({});
  const getA = (seat: number) => {
    if (!anim.current[seat]) anim.current[seat] = { op: new Animated.Value(1), sc: new Animated.Value(1), tx: new Animated.Value(0) };
    return anim.current[seat];
  };
  const winPulse = useRef(new Animated.Value(1)).current;

  function teaseOut(seat: number) {
    const a = getA(seat);
    a.tx.setValue(0); a.sc.setValue(1); a.op.setValue(1);
    Animated.sequence([
      // grow
      Animated.timing(a.sc, { toValue: 1.7, duration: 360, useNativeDriver: false }),
      // shake hard while big (the tease)
      Animated.sequence([
        Animated.timing(a.tx, { toValue: -9, duration: 55, useNativeDriver: false }),
        Animated.timing(a.tx, { toValue: 9, duration: 55, useNativeDriver: false }),
        Animated.timing(a.tx, { toValue: -8, duration: 55, useNativeDriver: false }),
        Animated.timing(a.tx, { toValue: 8, duration: 55, useNativeDriver: false }),
        Animated.timing(a.tx, { toValue: -5, duration: 55, useNativeDriver: false }),
        Animated.timing(a.tx, { toValue: 0, duration: 55, useNativeDriver: false }),
      ]),
      // then fade + shrink away
      Animated.parallel([
        Animated.timing(a.op, { toValue: 0.06, duration: 650, useNativeDriver: false }),
        Animated.timing(a.sc, { toValue: 0.7, duration: 650, useNativeDriver: false }),
      ]),
    ]).start();
  }

  useEffect(() => {
    const elim = new Set<number>();
    let i = 0;
    let timer: any;
    const tick = () => {
      if (i >= rounds.length) {
        if (!doneRef.current) {
          doneRef.current = true;
          setDone(true);
          Animated.sequence([
            Animated.timing(winPulse, { toValue: 1.28, duration: 280, useNativeDriver: false }),
            Animated.spring(winPulse, { toValue: 1, useNativeDriver: false }),
          ]).start();
          setTimeout(() => onDone?.(), 1600);
        }
        return;
      }
      const seats = rounds[i].eliminated;
      setRoundNo(i + 1);
      setTeasing(new Set(seats));
      seats.forEach((s) => teaseOut(s));
      // mark them eliminated (for strike-through) once the tease completes
      setTimeout(() => {
        seats.forEach((s) => elim.add(s));
        setEliminated(new Set(elim));
        setTeasing(new Set());
      }, 760);
      i++;
      timer = setTimeout(tick, ROUND_MS);
    };
    timer = setTimeout(tick, START_MS);
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
          const tease = teasing.has(e.seat);
          const win = done && e.seat === winnerSeat;
          const a = getA(e.seat);
          return (
            <Animated.View
              key={e.seat}
              style={[
                styles.seat,
                win && styles.seatWin,
                tease && styles.seatTease,
                { opacity: win ? 1 : a.op, transform: [{ scale: win ? winPulse : a.sc }, { translateX: a.tx }] },
              ]}
            >
              <Text style={[styles.seatNum, out && styles.seatNumOut, win && styles.seatNumWin, tease && styles.seatNumTease]}>{e.seat}</Text>
            </Animated.View>
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
  seatWin: { backgroundColor: colors.red, borderColor: colors.red },
  seatTease: { backgroundColor: colors.danger, borderColor: colors.danger },
  seatNum: { color: colors.text, fontSize: 13, fontWeight: "800" },
  seatNumOut: { textDecorationLine: "line-through", color: colors.faint },
  seatNumWin: { color: colors.onAccent },
  seatNumTease: { color: colors.onAccent },
  note: { color: colors.muted, fontSize: 12, marginTop: 14, textAlign: "center" },
});
