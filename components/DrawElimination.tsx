// Last-man-standing reveal. A single signed Random.org shuffle (server-side)
// decides the elimination order; this replays it as N-1 rounds — one seat
// knocked out per round — fitting the whole thing into ~10s with a speed ramp:
// fast early, then dramatically slower through the final 3 before the winner.
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { useTheme } from "@/lib/theme-context";
import { radius, AppColors } from "@/lib/theme";

export interface ElimRound { eliminated: number[] }

const TOTAL_MS = 10000;
const SLOW = [1100, 1700, 2600]; // durations for the final up-to-3 rounds (accelerating slowdown)
const FAST_MIN = 45;

export function DrawElimination({
  entrants, rounds, winnerSeat, onDone,
}: { entrants: { seat: number; name: string }[]; rounds: ElimRound[]; winnerSeat: number; onDone?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [eliminated, setEliminated] = useState<Set<number>>(new Set());
  const [teasing, setTeasing] = useState<Set<number>>(new Set());
  const [roundNo, setRoundNo] = useState(0);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

  const anim = useRef<Record<number, { op: Animated.Value; sc: Animated.Value; tx: Animated.Value }>>({});
  const getA = (s: number) => {
    if (!anim.current[s]) anim.current[s] = { op: new Animated.Value(1), sc: new Animated.Value(1), tx: new Animated.Value(0) };
    return anim.current[s];
  };
  const winPulse = useRef(new Animated.Value(1)).current;

  // per-round durations: fast early, slow final 3, ~10s total
  const schedule = useMemo(() => {
    const r = rounds.length;
    const slowCount = Math.min(3, r);
    const slowDurs = SLOW.slice(SLOW.length - slowCount);
    const slowSum = slowDurs.reduce((a, b) => a + b, 0);
    const fastCount = r - slowCount;
    const fastEach = fastCount > 0 ? Math.max(FAST_MIN, (TOTAL_MS - slowSum) / fastCount) : 0;
    return [...Array(fastCount).fill(fastEach), ...slowDurs];
  }, [rounds.length]);

  function eliminate(seat: number, dramatic: boolean) {
    const a = getA(seat);
    a.tx.setValue(0); a.sc.setValue(1); a.op.setValue(1);
    if (dramatic) {
      setTeasing((s) => new Set(s).add(seat));
      Animated.sequence([
        Animated.timing(a.sc, { toValue: 1.7, duration: 340, useNativeDriver: false }),
        Animated.sequence([
          Animated.timing(a.tx, { toValue: -9, duration: 55, useNativeDriver: false }),
          Animated.timing(a.tx, { toValue: 9, duration: 55, useNativeDriver: false }),
          Animated.timing(a.tx, { toValue: -8, duration: 55, useNativeDriver: false }),
          Animated.timing(a.tx, { toValue: 8, duration: 55, useNativeDriver: false }),
          Animated.timing(a.tx, { toValue: 0, duration: 55, useNativeDriver: false }),
        ]),
        Animated.parallel([
          Animated.timing(a.op, { toValue: 0.06, duration: 650, useNativeDriver: false }),
          Animated.timing(a.sc, { toValue: 0.7, duration: 650, useNativeDriver: false }),
        ]),
      ]).start(() => setTeasing((s) => { const n = new Set(s); n.delete(seat); return n; }));
    } else {
      // quick blur for the fast early rounds
      Animated.parallel([
        Animated.sequence([
          Animated.timing(a.sc, { toValue: 1.22, duration: 80, useNativeDriver: false }),
          Animated.timing(a.sc, { toValue: 0.85, duration: 150, useNativeDriver: false }),
        ]),
        Animated.timing(a.op, { toValue: 0.08, duration: 210, useNativeDriver: false }),
      ]).start();
    }
  }

  useEffect(() => {
    const elim = new Set<number>();
    let i = 0;
    let timer: any;
    const step = () => {
      if (i >= rounds.length) {
        if (!doneRef.current) {
          doneRef.current = true;
          setDone(true);
          Animated.sequence([
            Animated.timing(winPulse, { toValue: 1.3, duration: 280, useNativeDriver: false }),
            Animated.spring(winPulse, { toValue: 1, useNativeDriver: false }),
          ]).start();
          setTimeout(() => onDone?.(), 1100);
        }
        return;
      }
      const dramatic = i >= rounds.length - 3;
      rounds[i].eliminated.forEach((s) => { eliminate(s, dramatic); elim.add(s); });
      setEliminated(new Set(elim));
      setRoundNo(i + 1);
      const dur = schedule[i] ?? 300;
      i++;
      timer = setTimeout(step, dur);
    };
    timer = setTimeout(step, 500);
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
                styles.seat, win && styles.seatWin, tease && styles.seatTease,
                { opacity: win ? 1 : a.op, transform: [{ scale: win ? winPulse : a.sc }, { translateX: a.tx }] },
              ]}
            >
              <Text style={[styles.seatNum, out && styles.seatNumOut, win && styles.seatNumWin, tease && styles.seatNumWin]}>{e.seat}</Text>
            </Animated.View>
          );
        })}
      </View>
      {done && <Text style={styles.note}>{rounds.length} round{rounds.length === 1 ? "" : "s"} · order set by a signed Random.org shuffle.</Text>}
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
  note: { color: colors.muted, fontSize: 12, marginTop: 14, textAlign: "center" },
});
