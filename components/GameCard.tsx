// Shared game tile — the 4:5 image card with an overlaid footer used on the home
// page. Reuse everywhere games are listed so they all look the same.
import { useMemo } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/lib/theme-context";
import { radius, AppColors } from "@/lib/theme";

export type GameCardData = {
  id: string;
  title: string;
  cover_url?: string | null;
  amount_cents?: number | null;
  capacity?: number | null;
  claimed?: number | null;
  status?: string | null;
};

export function GameCard({
  data, width, onPress, badge, footLeft, footRight,
}: {
  data: GameCardData;
  width: number;
  onPress: () => void;
  badge?: string;
  footLeft?: string;
  footRight?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const cap = data.capacity ?? 0;
  const claimed = data.claimed ?? 0;
  const pct = Math.min(100, Math.round((claimed / Math.max(cap, 1)) * 100));
  const left = Math.max(cap - claimed, 0);
  const price = data.amount_cents != null ? `$${data.amount_cents % 100 === 0 ? (data.amount_cents / 100).toFixed(0) : (data.amount_cents / 100).toFixed(2)}` : "";
  const closed = data.status === "complete" || data.status === "canceled";
  const full = !closed && cap > 0 && claimed >= cap;

  return (
    <TouchableOpacity activeOpacity={0.9} style={[styles.card, { width }]} onPress={onPress}>
      {data.cover_url
        ? <Image source={{ uri: data.cover_url }} style={styles.img} />
        : <LinearGradient colors={[colors.surfaceAlt, colors.border]} style={styles.img} />}
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.82)"]} style={styles.shade} />
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
      {(closed || full) && (
        <>
          <View style={styles.dim} pointerEvents="none" />
          <View style={styles.fullStamp} pointerEvents="none">
            <Text style={[
              closed ? styles.closedStampText : styles.fullStampText,
              { fontSize: Math.round(width * (closed ? 0.2 : 0.32)), borderWidth: Math.max(4, Math.round(width * 0.018)) },
            ]}>{closed ? "CLOSED" : "FULL"}</Text>
          </View>
        </>
      )}
      <View style={styles.footer}>
        <Text style={styles.title} numberOfLines={1}>{data.title}</Text>
        <View style={styles.bar}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
        <View style={styles.row}>
          <Text style={styles.price}>{footLeft ?? price}</Text>
          <Text style={styles.left}>{footRight ?? `${left} left`}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden", aspectRatio: 4 / 5 },
  img: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  shade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "55%" },
  badge: { position: "absolute", top: 8, left: 8, backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4, zIndex: 5 },
  badgeText: { color: colors.onAccent, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 9, paddingBottom: 9, paddingTop: 4, zIndex: 5 },
  title: { color: "#fff", fontSize: 13, fontWeight: "800" },
  bar: { height: 4, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.28)", marginTop: 6, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.red },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  price: { color: "#fff", fontSize: 12, fontWeight: "800" },
  left: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "600" },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 3 },
  fullStamp: { position: "absolute", top: 0, bottom: 0, left: -8, right: -8, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-13deg" }], zIndex: 4 },
  fullStampText: { color: "#FF2A2A", fontSize: 38, fontWeight: "900", letterSpacing: 5, borderWidth: 4, borderColor: "#FF2A2A", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 2, backgroundColor: "rgba(255,42,42,0.12)", textShadowColor: "rgba(0,0,0,0.55)", textShadowRadius: 5, overflow: "hidden" },
  closedStampText: { color: "#E6E8EB", fontSize: 32, fontWeight: "900", letterSpacing: 4, borderWidth: 4, borderColor: "#E6E8EB", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 2, backgroundColor: "rgba(0,0,0,0.45)", textShadowColor: "rgba(0,0,0,0.7)", textShadowRadius: 5, overflow: "hidden" },
});
