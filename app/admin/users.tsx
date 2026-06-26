import { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

interface Row {
  id: string;
  email: string;
  display_name: string;
  role: "host" | "player";
  host_approved: boolean | null;
  is_superadmin: boolean;
  created_at: string;
}

type Filter = "all" | "host" | "player";

export default function AdminUsers() {
  const { isSuperadmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (data) setRows(data as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (isSuperadmin) load(); }, [isSuperadmin, load]);

  if (!isSuperadmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>🚫 Superadmin only</Text>
        <TouchableOpacity onPress={() => router.replace("/")}><Text style={styles.back}>← Home</Text></TouchableOpacity>
      </View>
    );
  }

  const visible = rows
    .filter((r) => (filter === "all" ? true : r.role === filter))
    .filter((r) => {
      const s = q.trim().toLowerCase();
      return !s || r.display_name?.toLowerCase().includes(s) || r.email?.toLowerCase().includes(s);
    });

  const hosts = rows.filter((r) => r.role === "host").length;
  const players = rows.filter((r) => r.role === "player").length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 40 }}>
      <Text style={styles.h1}>🛡️ All Accounts</Text>
      <Text style={styles.sub}>{rows.length} total · {hosts} hosts · {players} players</Text>

      <TextInput
        style={styles.search}
        placeholder="Search name or email…"
        placeholderTextColor={colors.faint}
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
      />

      <View style={styles.tabs}>
        {(["all", "host", "player"] as Filter[]).map((f) => (
          <TouchableOpacity key={f} style={[styles.tab, filter === f && styles.tabActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>{f === "all" ? "All" : f === "host" ? "Hosts" : "Players"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.red} style={{ marginTop: 24 }} />
      ) : visible.length === 0 ? (
        <Text style={styles.empty}>No accounts.</Text>
      ) : (
        visible.map((r) => (
          <TouchableOpacity key={r.id} style={styles.card} activeOpacity={0.85} onPress={() => router.push(`/u/${r.id}`)}>
            <View style={styles.cardTop}>
              <Text style={styles.name}>{r.display_name}</Text>
              <View style={[styles.pill, r.role === "host" ? styles.pillHost : styles.pillPlayer]}>
                <Text style={styles.pillText}>{r.role}</Text>
              </View>
            </View>
            <Text style={styles.email}>{r.email}</Text>
            <Text style={styles.meta}>
              {r.is_superadmin ? "🛡️ Superadmin · " : ""}
              {r.role === "host"
                ? r.host_approved === true ? "✅ Approved" : r.host_approved === null ? "⏳ Pending" : "❌ Rejected"
                : "Player"}
            </Text>
          </TouchableOpacity>
        ))
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12 },
  denied: { color: colors.text, fontSize: 16, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 16 },
  search: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, color: colors.text, fontSize: 14, marginBottom: 12 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.red, borderColor: colors.red },
  tabText: { color: colors.muted, fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: colors.onAccent },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: colors.text, fontSize: 16, fontWeight: "700", flex: 1 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  pillHost: { backgroundColor: colors.redSoft },
  pillPlayer: { backgroundColor: colors.navySoft },
  pillText: { color: colors.text, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  email: { color: colors.muted, fontSize: 13, marginTop: 4 },
  meta: { color: colors.faint, fontSize: 12, marginTop: 6 },
  empty: { color: colors.muted, marginTop: 24, textAlign: "center" },
  backBtn: { alignSelf: "center", marginTop: 20, padding: 10 },
  back: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
