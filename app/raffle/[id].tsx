import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, TextInput, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";

interface Raffle {
  id: string; host_id: string; title: string; prize: string | null; description: string | null;
  cover_url: string | null; capacity: number; free_seat_limit: number; entry_word: string;
  amount_cents: number; status: string;
}
interface Ticket { id: string; seat_number: number; owner_id: string; type: "free" | "paid"; status: string; }

export default function RaffleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [pickNum, setPickNum] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: r }, { data: t }] = await Promise.all([
      supabase.from("raffles").select("*").eq("id", id).single(),
      supabase.from("tickets").select("*").eq("raffle_id", id).order("seat_number"),
    ]);
    if (r) setRaffle(r as Raffle);
    if (t) setTickets(t as Ticket[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  if (!raffle) return <View style={styles.center}><Text style={styles.muted}>Raffle not found.</Text></View>;

  const isHost = raffle.host_id === user?.id;
  const freeUsed = tickets.filter((t) => t.type === "free").length;
  const claimed = tickets.length;
  const open = raffle.capacity - claimed;
  const myFree = tickets.some((t) => t.type === "free" && t.owner_id === user?.id);
  const gridMode = raffle.capacity <= 120;
  const money = (c: number) => `$${(c / 100).toFixed(0)}`;

  async function claim(type: "free" | "paid", seat: number) {
    setClaiming(true);
    try {
      const { error } = await supabase.rpc("claim_seat", { p_raffle: raffle!.id, p_seat: seat, p_type: type });
      if (error) throw error;
      setPickNum("");
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't claim seat", e?.message ?? "Try again.");
    } finally {
      setClaiming(false);
    }
  }

  function paidPick() {
    const n = parseInt(pickNum, 10);
    if (!(n >= 1 && n <= raffle!.capacity)) { Alert.alert("Enter a seat number", `1–${raffle!.capacity}`); return; }
    claim("paid", n);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      {raffle.cover_url ? <Image source={{ uri: raffle.cover_url }} style={styles.cover} /> : <View style={[styles.cover, styles.coverPh]} />}
      <View style={styles.pad}>
        <Text style={styles.title}>{raffle.title}</Text>
        {raffle.prize ? <Text style={styles.prize}>🏆 {raffle.prize}</Text> : null}
        {raffle.description ? <Text style={styles.desc}>{raffle.description}</Text> : null}

        <View style={styles.counts}>
          <Count label="Open" value={open} />
          <Count label={`Free (${raffle.free_seat_limit} max)`} value={freeUsed} />
          <Count label="Claimed" value={claimed} />
        </View>

        {!isHost && raffle.status === "open" && (
          <View style={styles.claimBox}>
            <Text style={styles.claimTitle}>Claim a seat</Text>
            <TouchableOpacity
              style={[styles.btn, styles.btnGreen, (claiming || myFree || freeUsed >= raffle.free_seat_limit || open <= 0) && styles.btnDim]}
              disabled={claiming || myFree || freeUsed >= raffle.free_seat_limit || open <= 0}
              onPress={() => claim("free", 0)}
            >
              <Text style={[styles.btnText, { color: colors.green }]}>
                🎟️ Free seat — random {myFree ? "(already claimed)" : ""}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnRed, (claiming || open <= 0) && styles.btnDim]} disabled={claiming || open <= 0} onPress={() => claim("paid", 0)}>
              <Text style={[styles.btnText, { color: colors.onAccent }]}>💳 Paid — random seat · {money(raffle.amount_cents)}</Text>
            </TouchableOpacity>
            <View style={styles.pickRow}>
              <TextInput style={styles.pickInput} placeholder="Seat #" placeholderTextColor={colors.faint} keyboardType="number-pad" value={pickNum} onChangeText={setPickNum} />
              <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }, (claiming || open <= 0) && styles.btnDim]} disabled={claiming || open <= 0} onPress={paidPick}>
                <Text style={[styles.btnText, { color: colors.text }]}>🎯 Paid — pick seat</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.payNote}>Paid seats are confirmed by the host after payment (Venmo/Zelle/Cash App/PayPal).</Text>
          </View>
        )}

        {/* Seat board */}
        <Text style={styles.boardTitle}>Seat board</Text>
        {gridMode ? (
          <View style={styles.board}>
            {Array.from({ length: raffle.capacity }, (_, i) => {
              const seat = i + 1;
              const t = tickets.find((x) => x.seat_number === seat);
              return (
                <View key={seat} style={[styles.seat, t?.type === "free" ? styles.seatFree : t?.type === "paid" ? styles.seatPaid : styles.seatOpen]}>
                  <Text style={[styles.seatNum, t ? styles.seatNumClaimed : null]}>{seat}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.bigNote}>{raffle.capacity} seats · {claimed} claimed · use “Pick seat” above to choose a number.</Text>
        )}

        {isHost && (
          <TouchableOpacity style={[styles.btn, styles.btnRed, { marginTop: 20 }]} onPress={() => Alert.alert("Draw coming soon", "The Random.org signed draw + wheel is the next build.")}>
            <Text style={[styles.btnText, { color: colors.onAccent }]}>🎡 Run the draw</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.countItem}>
      <Text style={styles.countVal}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  muted: { color: colors.muted },
  cover: { width: "100%", height: 180 },
  coverPh: { backgroundColor: colors.navy },
  pad: { padding: 20 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  prize: { color: colors.muted, fontSize: 16, marginTop: 6 },
  desc: { color: colors.muted, fontSize: 14, marginTop: 10, lineHeight: 20 },
  counts: { flexDirection: "row", gap: 12, marginTop: 18, marginBottom: 6 },
  countItem: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, alignItems: "center" },
  countVal: { color: colors.text, fontSize: 22, fontWeight: "800" },
  countLabel: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: "center" },
  claimBox: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, marginTop: 16, gap: 10 },
  claimTitle: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  btn: { paddingVertical: 13, borderRadius: radius.md, alignItems: "center" },
  btnGreen: { backgroundColor: colors.greenSoft },
  btnRed: { backgroundColor: colors.red },
  btnOutline: { borderWidth: 1, borderColor: colors.border },
  btnDim: { opacity: 0.45 },
  btnText: { fontSize: 15, fontWeight: "700" },
  pickRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  pickInput: { width: 90, backgroundColor: colors.surfaceAlt, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, color: colors.text, textAlign: "center", fontWeight: "700" },
  payNote: { color: colors.faint, fontSize: 11, lineHeight: 16 },
  boardTitle: { color: colors.text, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 24, marginBottom: 12 },
  board: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  seat: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  seatOpen: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  seatFree: { backgroundColor: colors.greenSoft },
  seatPaid: { backgroundColor: colors.redSoft },
  seatNum: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  seatNumClaimed: { color: colors.text },
  bigNote: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  backBtn: { alignSelf: "center", marginTop: 22, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
