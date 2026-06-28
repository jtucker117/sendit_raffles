import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

interface Raffle { id: string; host_id: string; title: string; status: string; amount_cents: number; capacity: number; }
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [tab, setTab] = useState<"pending" | "confirmed">("pending");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: r }, { data: t }] = await Promise.all([
      supabase.from("raffles").select("id, host_id, title, status, amount_cents, capacity").eq("id", id).single(),
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
  if (!raffle) return <View style={styles.center}><Text style={styles.muted}>Game not found.</Text></View>;
  if (raffle.host_id !== user?.id) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Only the host can manage entries.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </View>
    );
  }

  const nameFor = (oid: string) => names[oid] ?? (oid === user?.id ? "You" : "Player");
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const pending = tickets.filter((t) => t.type === "paid" && t.status === "held").sort((a, b) => a.seat_number - b.seat_number);
  const confirmed = tickets.filter((t) => t.status === "confirmed").sort((a, b) => a.seat_number - b.seat_number);

  // Revenue summary
  const price = raffle.amount_cents;
  const confirmedPaid = tickets.filter((t) => t.type === "paid" && t.status === "confirmed").length;
  const heldPaid = tickets.filter((t) => t.type === "paid" && t.status === "held").length;
  const reservedPaid = tickets.filter((t) => t.type === "paid" && t.status === "reserved").length;
  const sellablePaid = Math.max(0, raffle.capacity - reservedPaid); // seats that can actually generate revenue
  const collectedCents = confirmedPaid * price;
  const pendingCents = heldPaid * price;
  const maxCents = sellablePaid * price;

  // Bulk-confirm every selected pending seat with one payment method.
  async function confirmBulk(method: string) {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("tickets")
      .update({ status: "confirmed", paid_method: method, paid_at: new Date().toISOString() })
      .in("id", ids);
    if (error) Alert.alert("Couldn't confirm", error.message);
    setSelected(new Set());
    await load();
    setBulkBusy(false);
  }
  // Bulk-remove selected entries (e.g. players who never paid).
  async function removeBulk() {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    const { error } = await supabase.from("tickets").delete().in("id", ids);
    if (error) Alert.alert("Couldn't remove", error.message);
    setSelected(new Set());
    await load();
    setBulkBusy(false);
  }
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const togglePlayer = (ids: string[]) => setSelected((s) => { const n = new Set(s); const all = ids.every((i) => n.has(i)); ids.forEach((i) => (all ? n.delete(i) : n.add(i))); return n; });

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

  // group pending seats by player so a whole player can be selected at once
  const groupMap = new Map<string, Ticket[]>();
  pending.forEach((t) => { if (!groupMap.has(t.owner_id)) groupMap.set(t.owner_id, []); groupMap.get(t.owner_id)!.push(t); });
  const groups = [...groupMap.entries()].map(([ownerId, tks]) => ({ ownerId, tks }));
  const allSelected = pending.length > 0 && pending.every((t) => selected.has(t.id));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 40 }}>
      <Text style={styles.eyebrow}>MANAGE ENTRIES</Text>
      <Text style={styles.title}>{raffle.title}</Text>
      <Text style={styles.sub}>Confirm payments, remove or refund players.</Text>

      {/* Revenue summary */}
      <View style={styles.moneyCard}>
        <View style={styles.moneyTop}>
          <Text style={styles.moneyPrice}>{money(price)}</Text>
          <Text style={styles.moneyPriceLabel}>per seat</Text>
        </View>
        <View style={styles.moneyRow}>
          <View style={styles.moneyBox}>
            <Text style={[styles.moneyVal, { color: colors.green }]}>{money(collectedCents)}</Text>
            <Text style={styles.moneyLabel}>Collected ({confirmedPaid})</Text>
          </View>
          <View style={styles.moneyBox}>
            <Text style={[styles.moneyVal, { color: colors.red }]}>{money(pendingCents)}</Text>
            <Text style={styles.moneyLabel}>Pending ({heldPaid})</Text>
          </View>
          <View style={styles.moneyBox}>
            <Text style={styles.moneyVal}>{money(maxCents)}</Text>
            <Text style={styles.moneyLabel}>If sold out ({sellablePaid})</Text>
          </View>
        </View>
        {reservedPaid > 0 && <Text style={styles.moneyNote}>{reservedPaid} seat{reservedPaid === 1 ? "" : "s"} reserved for a mini (no revenue — they're the prize).</Text>}
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === "pending" && styles.tabActive]} onPress={() => setTab("pending")}>
          <Text style={[styles.tabText, tab === "pending" && styles.tabTextActive]}>Pending · {pending.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "confirmed" && styles.tabActive]} onPress={() => setTab("confirmed")}>
          <Text style={[styles.tabText, tab === "confirmed" && styles.tabTextActive]}>Confirmed · {confirmed.length}</Text>
        </TouchableOpacity>
      </View>

      {tab === "pending" ? (
        pending.length === 0 ? (
          <Text style={styles.empty}>No payments waiting.</Text>
        ) : (
          <>
            <View style={styles.selBar}>
              <TouchableOpacity style={styles.checkRow} onPress={() => setSelected(allSelected ? new Set() : new Set(pending.map((t) => t.id)))}>
                <View style={[styles.check, allSelected && styles.checkOn]}>{allSelected ? <Text style={styles.checkMark}>✓</Text> : null}</View>
                <Text style={styles.selAll}>Select all ({pending.length})</Text>
              </TouchableOpacity>
              {selected.size > 0 && <Text style={styles.selCount}>{selected.size} selected</Text>}
            </View>

            {selected.size > 0 && (
              <View style={styles.bulkBar}>
                <Text style={styles.bulkLabel}>Mark {selected.size} seat{selected.size === 1 ? "" : "s"} paid via:</Text>
                <View style={styles.methodRow}>
                  {PAYMENT_METHODS.map((m) => (
                    <TouchableOpacity key={m} style={[styles.methodChip, bulkBusy && styles.dim]} disabled={bulkBusy} onPress={() => confirmBulk(m)}>
                      <Text style={styles.methodChipText}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={[styles.removeBulk, bulkBusy && styles.dim]} disabled={bulkBusy} onPress={removeBulk}>
                  <Text style={styles.removeBulkText}>Remove {selected.size} (didn’t pay)</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.hint}>Tip: tap a player to select all their seats, then mark them paid by one platform.</Text>

            {groups.map((g) => {
              const ids = g.tks.map((t) => t.id);
              const allG = ids.every((i) => selected.has(i));
              return (
                <View key={g.ownerId} style={styles.card}>
                  <TouchableOpacity style={styles.groupHead} onPress={() => togglePlayer(ids)}>
                    <View style={[styles.check, allG && styles.checkOn]}>{allG ? <Text style={styles.checkMark}>✓</Text> : null}</View>
                    <Text style={styles.groupName}>{nameFor(g.ownerId)}</Text>
                    <Text style={styles.groupCount}>{g.tks.length} seat{g.tks.length === 1 ? "" : "s"}</Text>
                  </TouchableOpacity>
                  {g.tks.map((t) => (
                    <View key={t.id} style={styles.row}>
                      <TouchableOpacity style={styles.rowSelect} onPress={() => toggleSel(t.id)}>
                        <View style={[styles.check, selected.has(t.id) && styles.checkOn]}>{selected.has(t.id) ? <Text style={styles.checkMark}>✓</Text> : null}</View>
                        <Text style={styles.rowMeta}>Seat #{t.seat_number} · {money(price)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.pill, styles.pillRed, busyTicket === t.id && styles.dim]} disabled={busyTicket === t.id} onPress={() => removeTicket(t.id)}>
                        <Text style={styles.pillRedText}>{confirmRemove === t.id ? "Sure?" : "Reject"}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })}
          </>
        )
      ) : (
        confirmed.length === 0 ? (
          <Text style={styles.empty}>No confirmed entries yet.</Text>
        ) : (
          <View style={styles.card}>
            {confirmed.map((t) => (
              <View key={t.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{nameFor(t.owner_id)}</Text>
                  <Text style={styles.rowMeta}>Seat #{t.seat_number} · {t.type === "paid" ? money(price) : "free"}{t.paid_method ? ` · ${t.paid_method}` : ""}</Text>
                </View>
                {raffle.status === "open" && (
                  <TouchableOpacity style={[styles.pill, styles.pillRed, busyTicket === t.id && styles.dim]} disabled={busyTicket === t.id} onPress={() => removeTicket(t.id)}>
                    <Text style={styles.pillRedText}>{confirmRemove === t.id ? "Sure?" : "Remove"}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back to game</Text></TouchableOpacity>
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
  moneyCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, marginTop: 16 },
  moneyTop: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 12 },
  moneyPrice: { color: colors.text, fontSize: 26, fontWeight: "900" },
  moneyPriceLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  moneyRow: { flexDirection: "row", gap: 10 },
  moneyBox: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  moneyVal: { color: colors.text, fontSize: 17, fontWeight: "900" },
  moneyLabel: { color: colors.muted, fontSize: 10.5, fontWeight: "700", marginTop: 3, textAlign: "center" },
  moneyNote: { color: colors.faint, fontSize: 11.5, marginTop: 10, lineHeight: 16 },
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
  // multi-select
  selBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  selAll: { color: colors.text, fontSize: 13, fontWeight: "700" },
  selCount: { color: colors.red, fontSize: 13, fontWeight: "800" },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  checkOn: { backgroundColor: colors.red, borderColor: colors.red },
  checkMark: { color: colors.onAccent, fontSize: 13, fontWeight: "900" },
  bulkBar: { backgroundColor: colors.surface, borderColor: colors.red, borderWidth: 1, borderRadius: radius.lg, padding: 14, marginTop: 12 },
  bulkLabel: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 10 },
  removeBulk: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, alignItems: "center" },
  removeBulkText: { color: colors.danger, fontSize: 13, fontWeight: "800" },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  groupName: { color: colors.text, fontSize: 15, fontWeight: "800", flex: 1 },
  groupCount: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  rowSelect: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  backBtn: { alignSelf: "center", marginTop: 26, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
