// Send It Raffles — the spinning prize wheel.
// One slice per confirmed entrant. When `spinTo` is set to a winner index it
// spins several turns and lands that slice under the top pointer, then fires
// onSpinEnd. Pure react-native-svg so it renders on web + iOS + Android.

import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import Svg, { G, Path, Text as SvgText } from "react-native-svg";
import { colors } from "@/lib/theme";

const LOGO = require("../assets/logo.png");

export interface WheelEntrant { seat: number; name: string }

// Slice fills cycle through the brand palette (amber/gold + deep navy) so
// neighbors never match. Label color pairs with each fill for contrast.
const SLICE_FILLS = ["#f59e0b", "#1b2b4d", "#d97706", "#243043", "#f4b740", "#14223f"];
const SLICE_TEXT = ["#1a1407", "#ffffff", "#1a1407", "#ffffff", "#1a1407", "#ffffff"];

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function DrawWheel({
  entrants,
  spinTo,
  onSpinEnd,
  size = 300,
}: {
  entrants: WheelEntrant[];
  spinTo: number | null;       // winner index, or null = idle
  onSpinEnd?: () => void;
  size?: number;
}) {
  const rotation = useRef(new Animated.Value(0)).current;
  const spunFor = useRef<number | null>(null);
  const N = Math.max(entrants.length, 1);
  const slice = 360 / N;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  // Build the pie slices once per entrant set.
  const slices = useMemo(() => {
    return entrants.map((e, i) => {
      const a0 = -90 + i * slice;
      const a1 = -90 + (i + 1) * slice;
      const p0 = polar(cx, cy, r, a0);
      const p1 = polar(cx, cy, r, a1);
      const large = slice > 180 ? 1 : 0;
      const d = `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`;
      const mid = -90 + (i + 0.5) * slice;
      const label = polar(cx, cy, r * 0.66, mid);
      return { d, fill: SLICE_FILLS[i % SLICE_FILLS.length], text: SLICE_TEXT[i % SLICE_TEXT.length], seat: e.seat, label, mid };
    });
  }, [entrants, slice, cx, cy, r]);

  useEffect(() => {
    if (spinTo == null) return;
    if (spunFor.current === spinTo) return; // already spun for this result — don't re-spin
    spunFor.current = spinTo;
    // Land the winner's slice center under the top pointer after 6 full turns.
    const target = 360 * 6 - (spinTo + 0.5) * slice;
    rotation.setValue(0);
    Animated.timing(rotation, {
      toValue: target,
      duration: 5200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // web (primary target) animates transforms via the JS driver
    }).start(({ finished }) => { if (finished) onSpinEnd?.(); });
  }, [spinTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const spin = rotation.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] });
  const logoSize = size * 0.26;
  const fontSize = Math.max(8, Math.min(16, (slice / 360) * 220));
  // Always one slice per seat. Thin out the dividers and hide the seat numbers
  // once slices get too small to label, so it never *looks* batched.
  const strokeWidth = N > 80 ? 0.4 : N > 40 ? 0.8 : N > 16 ? 1.2 : 2;
  const showLabels = slice >= 7; // ~N <= 51

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* Pointer (fixed, points down into the wheel) */}
      <View style={[styles.pointer, { top: -2 }]} />

      <Animated.View style={{ width: size, height: size, transform: [{ rotate: spin }] }}>
        <Svg width={size} height={size}>
          <G>
            {slices.map((s, i) => (
              <G key={i}>
                <Path d={s.d} fill={s.fill} stroke={colors.bg} strokeWidth={strokeWidth} />
                {showLabels && (
                  <SvgText
                    x={s.label.x}
                    y={s.label.y}
                    fill={s.text}
                    fontSize={fontSize}
                    fontWeight="bold"
                    textAnchor="middle"
                    alignmentBaseline="central"
                    transform={`rotate(${s.mid + 90}, ${s.label.x}, ${s.label.y})`}
                  >
                    {s.seat}
                  </SvgText>
                )}
              </G>
            ))}
          </G>
        </Svg>
      </Animated.View>

      {/* Center hub + logo (does not rotate) */}
      <View style={[styles.hub, { width: logoSize + 16, height: logoSize + 16, borderRadius: (logoSize + 16) / 2 }]}>
        <Image source={LOGO} style={{ width: logoSize, height: logoSize }} resizeMode="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pointer: {
    position: "absolute",
    zIndex: 5,
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderTopWidth: 24,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: colors.red, // brand amber pointer
  },
  hub: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    borderWidth: 3,
    borderColor: colors.red, // brand amber ring around the logo hub
  },
});
