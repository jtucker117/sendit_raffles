import { useMemo } from "react";
import { View, Text, ImageBackground, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme-context";
import { radius, AppColors } from "@/lib/theme";

export interface RaffleCardData {
  id: string;
  title: string;
  prize?: string | null;
  cover_url?: string | null;
  capacity: number;
  entry_word: string;
  amount_cents: number;
  status: string;
}

// Editorial full-bleed card: cover photo + gradient + bold uppercase title,
// a stat row, and a circular arrow. Canceled raffles show a badge + dim.
export function RaffleCard({ raffle, onPress }: { raffle: RaffleCardData; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const money = `$${(raffle.amount_cents / 100).toFixed(0)}`;
  const canceled = raffle.status === "canceled";
  const complete = raffle.status === "complete";

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statVal} numberOfLines={1}>{value}</Text>
    </View>
  );

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[styles.card, canceled && styles.cardDim]}>
      <ImageBackground source={raffle.cover_url ? { uri: raffle.cover_url } : undefined} style={styles.cover} imageStyle={styles.coverImg}>
        {!raffle.cover_url && <View style={styles.coverPh} />}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} style={StyleSheet.absoluteFill} />

        {(canceled || complete) && (
          <View style={[styles.badge, canceled ? styles.badgeRed : styles.badgeGray]}>
            <Text style={styles.badgeText}>{canceled ? "CANCELED" : "DRAWN"}</Text>
          </View>
        )}

        <View style={styles.arrow}><Ionicons name="arrow-forward" size={18} color="#000" /></View>

        <View style={styles.overlay}>
          <Text style={styles.title} numberOfLines={2}>{raffle.title}</Text>
          {raffle.prize ? <Text style={styles.prize} numberOfLines={1}>{raffle.prize}</Text> : null}
        </View>
      </ImageBackground>

      <View style={styles.stats}>
        <Stat label="Seats" value={String(raffle.capacity)} />
        <View style={styles.divider} />
        <Stat label={raffle.entry_word} value={money} />
        <View style={styles.divider} />
        <Stat label="Status" value={raffle.status} />
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, overflow: "hidden", marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  cardDim: { opacity: 0.6 },
  cover: { width: "100%", height: 210, justifyContent: "flex-end" },
  coverImg: { resizeMode: "cover" },
  coverPh: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.navy },
  badge: { position: "absolute", top: 12, left: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeRed: { backgroundColor: colors.red },
  badgeGray: { backgroundColor: "rgba(0,0,0,0.7)" },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  arrow: { position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  overlay: { padding: 16 },
  title: { color: "#fff", fontSize: 24, fontWeight: "900", textTransform: "uppercase", letterSpacing: -0.4, lineHeight: 26 },
  prize: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 4 },
  stats: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16 },
  stat: { flex: 1 },
  statLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  statVal: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 3, textTransform: "capitalize" },
  divider: { width: 1, height: 28, backgroundColor: colors.border, marginHorizontal: 12 },
});
