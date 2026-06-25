// Scratch-off winner reveal. The winner is already decided by Random.org — this
// hides it under a foil you actually scratch away by dragging (mouse or touch).
// Built from a grid of foil tiles that vanish under the pointer; once ~half is
// scratched, the rest fades out and onDone fires. Cross-platform (no canvas).
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, PanResponder } from "react-native";
import { useTheme } from "@/lib/theme-context";
import { radius, AppColors } from "@/lib/theme";

const TILE = 26;          // foil tile size (px)
const REVEAL_AT = 0.5;    // fraction scratched before auto-revealing the rest
const CARD_H = 200;

export function DrawScratch({
  winnerName, winnerSeat, onDone,
}: { winnerName: string; winnerSeat: number; onDone?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [w, setW] = useState(0);
  const cols = Math.max(1, Math.floor(w / TILE));
  const rows = Math.max(1, Math.ceil(CARD_H / TILE));
  const [scratched, setScratched] = useState<boolean[]>([]);

  const coverOpacity = useRef(new Animated.Value(1)).current;
  const hintOpacity = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);
  const startedRef = useRef(false);

  // refs so the (once-created) PanResponder always sees current grid dims
  const dims = useRef({ cols, rows });
  dims.current = { cols, rows };

  useEffect(() => { setScratched(new Array(cols * rows).fill(false)); doneRef.current = false; }, [cols, rows]);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(coverOpacity, { toValue: 0, duration: 450, useNativeDriver: false }).start(() => onDone?.());
  }

  function scratchAt(x: number, y: number) {
    const { cols: c, rows: r } = dims.current;
    if (!startedRef.current) {
      startedRef.current = true;
      Animated.timing(hintOpacity, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    }
    const cc = Math.floor(x / TILE);
    const rr = Math.floor(y / TILE);
    setScratched((prev) => {
      if (prev.length !== c * r) return prev;
      const next = prev.slice();
      let changed = false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const x2 = cc + dc, y2 = rr + dr;
          if (x2 >= 0 && x2 < c && y2 >= 0 && y2 < r) {
            const idx = y2 * c + x2;
            if (!next[idx]) { next[idx] = true; changed = true; }
          }
        }
      }
      if (changed) {
        const count = next.reduce((a, b) => a + (b ? 1 : 0), 0);
        if (count / next.length >= REVEAL_AT) finish();
      }
      return changed ? next : prev;
    });
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => scratchAt(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (e) => scratchAt(e.nativeEvent.locationX, e.nativeEvent.locationY),
    }),
  ).current;

  return (
    <View style={styles.card} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {/* Prize / winner underneath */}
      <View style={styles.prize}>
        <Text style={styles.eyebrow}>WINNER</Text>
        <Text style={styles.name} numberOfLines={2}>{winnerName}</Text>
        <Text style={styles.seat}>Seat #{winnerSeat}</Text>
      </View>

      {/* Foil cover you scratch off */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: coverOpacity }]} {...pan.panHandlers}>
        {scratched.map((gone, idx) => {
          if (gone) return null;
          const c = idx % cols;
          const r = Math.floor(idx / cols);
          return <View key={idx} pointerEvents="none" style={[styles.tile, { left: c * TILE, top: r * TILE }]} />;
        })}
        <Animated.View pointerEvents="none" style={[styles.hint, { opacity: hintOpacity }]}>
          <Text style={styles.hintTitle}>Scratch to reveal</Text>
          <Text style={styles.hintSub}>drag across the card</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  card: { width: "100%", height: CARD_H, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  prize: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 16 },
  eyebrow: { color: colors.red, fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  name: { color: colors.text, fontSize: 30, fontWeight: "900", marginTop: 8, textAlign: "center" },
  seat: { color: colors.muted, fontSize: 14, marginTop: 4 },
  tile: { position: "absolute", width: TILE + 1, height: TILE + 1, backgroundColor: "#3a3d45" },
  hint: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  hintTitle: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 0.5 },
  hintSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 4 },
});
