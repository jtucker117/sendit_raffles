import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";

interface Raffle { id: string; host_id: string; title: string; status: string; amount_cents: number; }
interface Ticket { id: string; seat_number: number; owner_id: string; type: "free" | "paid"; status: string; paid_method: string | null; }

const PAYMENT_METHODS = ["Venmo", "Cash App", "Card", "PayPal", "Zelle"] as const;

export default function ManageEntries() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyTicket, setBusyTicket] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [methodFor, setMethodFor] = useState<string | null>(null); // ticket currently choosing a method
  const [tab, setTab] = useState<"pending" | "confirmed">("pending");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: r }, { data: t }] = await Promise.all([
      supabase.from("raffles").select("id, host_id, title, status, amount_cents").eq("id", id).single(),
      supabase.from("tickets").select("*").eq("raffle_id", id).order("seat_number"),
    ]);
    if (r) setRaffle(r as Raffle);
    const ts = (t ?? []) as Ticket[];
    setTickets(ts);
    const ownerIds = [...new Set(ts.map((x) => x.owner_id))];
    if (ownerIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ownerIds);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.display_name; });
      setNames(map);
    } else setNames({});
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  if (!raffle) return <View style={styles.center}><Text style={styles.muted}>Raffle not found.</Text></View>;
  if (raffle.host_id !== user?.id) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Only the host can manage entries.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </View>
    );
  }

  const nameFor = (oid: string) => names[oid] ?? (oid === user?.id ? "You" : "Player");
  const money = (c: number) => `$${(c / 100).toFixed(0)}`;
  const pending = tickets.filter((t) => t.type === "paid" && t.status === "held").sort((a, b) => a.seat_number - b.seat_number);
  const confirmed = tickets.filter((t) => t.status === "confirmed").sort((a, b) => a.seat_number - b.seat_number);

  async function confirmPaid(ticketId: string, method: string) {
    setBusyTicket(ticketId);
    const { error } = await supabase
      .from("tickets")
      .update({ status: "confirmed", paid_method: method, paid_at: new Date().toISOString() })
      .eq("id", ticketId);
    if (error) Alert.alert("Couldn't confirm", error.message);
    setMethodFor(null);
    await load();
    setBusyTicket(null);
  }

  async function removeTicket(ticketId: string) {
    if (confirmRemove !== ticketId) {
      setConfirmRemove(ticketId);
      setTimeout(() => setConfirmRemove((c) => (c === ticketId ? null : c)), 3000);
      return;
    }
    setBusyTicket(ticketId);
    const { error } = await supabase.from("tickets").delete().eq("id", ticketId);
    if (error) Alert.alert("Couldn't remove", error.message);
    setConfirmRemove(null);
    await load();
    setBusyTicket(null);
  }

  const list = tab === "pending" ? pending : confirmed;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={styles.eyebrow}>MANAGE ENTRIES</Text>
      <Text style={styles.title}>{raffle.title}</Text>
      <Text style={styles.sub}>Seat price {money(raffle.amount_cents)} · confirm payments, remove or refund players.</Text>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === "pending" && styles.tabActive]} onPress={() => setTab("pending")}>
          <Text style={[styles.tabText, tab === "pending" && styles.tabTextActive]}>Pending · {pending.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "confirmed" && styles.tabActive]} onPress={() => setTab("confirmed")}>
          <Text style={[styles.tabText, tab === "confirmed" && styles.tabTextActive]}>Confirmed · {confirmed.length}</Text>
        </TouchableOpacity>
      </View>

      {tab === "pending" && (
        <Text style={styles.hint}>Confirm once you’ve received payment — only confirmed seats are entered in the draw.</Text>
      )}

      {list.length === 0 ? (
        <Text style={styles.empty}>{tab === "pending" ? "No payments waiting." : "No confirmed entries yet."}</Text>
      ) : (
        <View style={styles.card}>
          {list.map((t) => (
            <View key={t.id} style={styles.rowWrap}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{nameFor(t.owner_id)}</Text>
                  <Text style={styles.rowMeta}>
                    Seat #{t.seat_number} · {t.type}{t.paid_method ? ` · ${t.paid_method}` : ""}
                  </Text>
                </View>
                {tab === "pending" && (
                  methodFor === t.id ? (
                    <TouchableOpacity style={[styles.pill, styles.pillGhost]} onPress={() => setMethodFor(null)}>
                      <Text style={styles.pillGhostText}>Cancel</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.pill, styles.pillGreen, busyTicket === t.id && styles.dim]} disabled={busyTicket === t.id} onPress={() => setMethodFor(t.id)}>
                      <Text style={styles.pillGreenText}>Confirm</Text>
                    </TouchableOpacity>
                  )
                )}
                {raffle.status === "open" && methodFor !== t.id && (
                  <TouchableOpacity style={[styles.pill, styles.pillRed, busyTicket === t.id && styles.dim]} disabled={busyTicket === t.id} onPress={() => removeTicket(t.id)}>
                    <Text style={styles.pillRedText}>{confirmRemove === t.id ? "Sure?" : tab === "pending" ? "Reject" : "Remove"}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Payment-method picker (appears when confirming a pending seat) */}
              {tab === "pending" && methodFor === t.id && (
                <View style={styles.methodBox}>
                  <Text style={styles.methodLabel}>How were they paid?</Text>
                  <View style={styles.methodRow}>
                    {PAYMENT_METHODS.map((m) => (
                      <TouchableOpacity key={m} style={[styles.methodChip, busyTicket === t.id && styles.dim]} disabled={busyTicket === t.id} onPress={() => confirmPaid(t.id, m)}>
                        <Text style={styles.methodChipText}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back to raffle</Text></TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 10 },
  muted: { color: colors.muted },
  eyebrow: { color: colors.red, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.3, marginTop: 4 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 18 },
  tab: { flex: 1, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", backgroundColor: colors.surface },
  tabActive: { borderColor: colors.red, backgroundColor: colors.redSoft },
  tabText: { color: colors.muted, fontWeight: "700", fontSize: 14 },
  tabTextActive: { color: colors.text },
  hint: { color: colors.faint, fontSize: 12, marginTop: 12, lineHeight: 16 },
  empty: { color: colors.muted, fontSize: 14, marginTop: 24, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 16, marginTop: 14 },
  rowWrap: { borderTopWidth: 1, borderTopColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 },
  rowName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 1, textTransform: "capitalize" },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  pillGreen: { backgroundColor: colors.greenSoft },
  pillGreenText: { color: colors.green, fontWeight: "700", fontSize: 13 },
  pillRed: { borderWidth: 1, borderColor: colors.red },
  pillRedText: { color: colors.red, fontWeight: "700", fontSize: 13 },
  pillGhost: { borderWidth: 1, borderColor: colors.border },
  pillGhostText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  methodBox: { paddingBottom: 14, paddingTop: 2 },
  methodLabel: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.greenSoft, borderWidth: 1, borderColor: colors.green },
  methodChipText: { color: colors.green, fontWeight: "700", fontSize: 13 },
  dim: { opacity: 0.45 },
  backBtn: { alignSelf: "center", marginTop: 26, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
