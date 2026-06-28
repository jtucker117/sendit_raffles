// Lightweight confetti burst — plays once on mount. Pure Animated (no deps),
// works on web + native. Drop it in an overlay; it's pointer-transparent.
import { useEffect, useMemo, useRef } from "react";
import { Animated, View, StyleSheet, useWindowDimensions, Easing } from "react-native";

const COLORS = ["#f59e0b", "#e8b72a", "#2fbf6b", "#ef4444", "#3b82f6", "#ffffff"];

export function Confetti({ count = 90 }: { count?: number }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      key: i,
      x: Math.random() * width,
      size: 6 + Math.random() * 8,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 450,
      drift: (Math.random() - 0.5) * 140,
      duration: 2200 + Math.random() * 1600,
      rot: Math.random() * 360,
    })),
    [count, width],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p) => <Piece key={p.key} p={p} height={height} />)}
    </View>
  );
}

function Piece({ p, height }: { p: any; height: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: p.duration, delay: p.delay, easing: Easing.in(Easing.quad), useNativeDriver: false }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-24, height + 24] });
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [p.x, p.x + p.drift] });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: [`${p.rot}deg`, `${p.rot + 540}deg`] });
  const opacity = t.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });
  return (
    <Animated.View
      style={{ position: "absolute", top: 0, left: 0, width: p.size, height: p.size * 0.6, backgroundColor: p.color, borderRadius: 2, transform: [{ translateY }, { translateX }, { rotate }], opacity }}
    />
  );
}
