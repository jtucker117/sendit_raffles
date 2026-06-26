import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

interface Raffle { id: string; title: string; amount_cents: number; host_id: string; capacity: number; }
interface Host {
  display_name: string;
  pay_venmo: string | null; pay_cashapp: string | null; pay_paypal: string | null; pay_zelle: string | null;
}
interface Method { key: string; handle: string | null }

// Build a deep link that opens the host's payment app (new tab) to send funds.
function payUrl(key: string, handle: string, amountCents: number): string | null {
  const amt = (amountCents / 100).toFixed(2);
  if (key === "Venmo") return `https://venmo.com/u/${encodeURIComponent(handle.replace(/^@/, ""))}`;
  if (key === "Cash App") return `https://cash.app/$${encodeURIComponent(handle.replace(/^\$/, ""))}/${amt}`;
  if (key === "PayPal") {
    const h = handle.trim();
    if (/paypal\.me\//i.test(h)) return `https://paypal.me/${h.replace(/^https?:\/\//i, "").replace(/^paypal\.me\//i, "")}/${amt}`;
    if (/^https?:\/\//i.test(h)) return h;
    return null; // plain email — not deep-linkable
  }
  return null; // Zelle / cash — no universal link
}

export default function Checkout() {
  const params = useLocalSearchParams<{ id: string; seats?: string; random?: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const explicitSeats = useMemo(
    () => (params.seats ? String(params.seats).split(",").map((s) => parseInt(s, 10)).filter((n) => n > 0) : []),
    [params.seats],
  );
  const randomQty = params.random ? Math.max(0, parseInt(String(params.random), 10) || 0) : 0;
  const qty = explicitSeats.length || randomQty;

  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [host, setHost] = useState<Host | null>(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    const { data: r } = await supabase.from("raffles").select("id, title, amount_cents, host_id, capacity").eq("id", params.id).single();
    if (r) {
      setRaffle(r as Raffle);
      const { data: h } = await supabase.from("profiles").select("display_name, pay_venmo, pay_cashapp, pay_paypal, pay_zelle").eq("id", (r as Raffle).host_id).single();
      if (h) setHost(h as Host);
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  if (!raffle) return <View style={styles.center}><Text style={styles.muted}>Raffle not found.</Text></View>;

  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const total = raffle.amount_cents * qty;

  const methods: Method[] = [];
  if (host?.pay_venmo) methods.push({ key: "Venmo", handle: host.pay_venmo });
  if (host?.pay_cashapp) methods.push({ key: "Cash App", handle: host.pay_cashapp });
  if (host?.pay_paypal) methods.push({ key: "PayPal", handle: host.pay_paypal });
  if (host?.pay_zelle) methods.push({ key: "Zelle", handle: host.pay_zelle });
  methods.push({ key: "Cash / in person", handle: null });

  const active = methods.find((m) => m.key === method) ?? methods[0];

  async function reserve() {
    if (qty < 1) { Alert.alert("Nothing to reserve"); return; }
    setBusy(true);
    try {
      const targets = explicitSeats.length ? explicitSeats : new Array(randomQty).fill(0);
      for (const seat of targets) {
        const { error } = await supabase.rpc("claim_seat", { p_raffle: raffle!.id, p_seat: seat, p_type: "paid" });
        if (error) throw error;
      }
      router.replace("/tickets");
    } catch (e: any) {
      Alert.alert("Couldn't reserve", e?.message ?? "Try again.");
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 40 }}>
        <Text style={styles.h1}>Checkout</Text>

        {/* Order summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{raffle.title}</Text>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>
              {qty} seat{qty === 1 ? "" : "s"} × {money(raffle.amount_cents)}
              {explicitSeats.length ? `  ·  ${explicitSeats.sort((a, b) => a - b).map((n) => `#${n}`).join(", ")}` : "  ·  random"}
            </Text>
            <Text style={styles.lineVal}>{money(total)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.line}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalVal}>{money(total)}</Text>
          </View>
        </View>

        {/* Payment */}
        <Text style={styles.section}>Pay the host</Text>
        <View style={styles.methods}>
          {methods.map((m) => (
            <TouchableOpacity key={m.key} style={[styles.method, active.key === m.key && styles.methodActive]} onPress={() => setMethod(m.key)}>
              <Text style={[styles.methodText, active.key === m.key && styles.methodTextActive]}>{m.key}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.payBox}>
          {active.handle ? (
            <>
              <Text style={styles.payHelp}>Send <Text style={styles.payStrong}>{money(total)}</Text> via {active.key} to:</Text>
              <Text selectable style={styles.handle}>{active.handle}</Text>
              {payUrl(active.key, active.handle, total) && (
                <TouchableOpacity style={styles.payOpen} onPress={() => Linking.openURL(payUrl(active.key, active.handle!, total)!)}>
                  <Text style={styles.payOpenText}>Open {active.key} to pay {money(total)} →</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.payHelp}>Arrange {active.key.toLowerCase()} payment with {host?.display_name ?? "the host"} ({money(total)}).</Text>
          )}
          <Text style={styles.payNote}>
            Reserve now, then send payment. Your seat{qty === 1 ? "" : "s"} stay held until the host confirms it’s received.
          </Text>
        </View>

        <TouchableOpacity style={[styles.btn, busy && styles.btnDim]} disabled={busy} onPress={reserve}>
          {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.btnText}>Reserve {qty} seat{qty === 1 ? "" : "s"} — {money(total)}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  muted: { color: colors.muted },
  h1: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.4, marginBottom: 16 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginBottom: 10 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  lineLabel: { color: colors.muted, fontSize: 13, flex: 1 },
  lineVal: { color: colors.text, fontSize: 13, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  totalLabel: { color: colors.text, fontSize: 15, fontWeight: "800" },
  totalVal: { color: colors.text, fontSize: 18, fontWeight: "900" },
  section: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 22, marginBottom: 10 },
  methods: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  method: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  methodActive: { borderColor: colors.red, backgroundColor: colors.redSoft },
  methodText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  methodTextActive: { color: colors.text },
  payBox: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, marginTop: 12 },
  payHelp: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  payStrong: { color: colors.text, fontWeight: "800" },
  handle: { color: colors.red, fontSize: 20, fontWeight: "900", marginTop: 6 },
  payOpen: { marginTop: 12, borderWidth: 1, borderColor: colors.red, borderRadius: radius.md, paddingVertical: 11, alignItems: "center" },
  payOpenText: { color: colors.red, fontSize: 14, fontWeight: "800" },
  payNote: { color: colors.faint, fontSize: 12, lineHeight: 16, marginTop: 10 },
  btn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 15, alignItems: "center", marginTop: 18 },
  btnDim: { opacity: 0.5 },
  btnText: { color: colors.onAccent, fontSize: 16, fontWeight: "800" },
  backBtn: { alignSelf: "center", marginTop: 18, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
