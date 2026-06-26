import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity, Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";

const LOGO = require("../../assets/logo.png");

interface Record {
  title: string; prize: string | null; cover_url: string | null; capacity: number;
  winning_seat: number; winner_name: string; randomorg_signed: any; rounds: any[] | null; drawn_at: string; entrants: number;
}

export default function PublicRecord() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const goBack = () => { if (router.canGoBack?.()) router.back(); else router.replace("/"); };

  const [rec, setRec] = useState<Record | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    const { data, error } = await supabase.functions.invoke("draw", { body: { record: true, raffle_id: id } });
    if (error || (data as any)?.error) {
      let detail = (data as any)?.error || error?.message || "Not found";
      try { const b = await (error as any)?.context?.json?.(); if (b?.error) detail = b.error; } catch {}
      setErr(detail);
    } else {
      setRec(data as Record);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const runVerify = useCallback(async (r: Record) => {
    const roundSigs = ((r.rounds ?? []) as any[]).map((x) => x?.signed).filter((s) => s?.random && s?.signature);
    const items = roundSigs.length ? roundSigs : (r.randomorg_signed?.random && r.randomorg_signed?.signature ? [r.randomorg_signed] : []);
    if (!items.length) return;
    let ok = 0;
    for (const s of items) {
      const { data } = await supabase.functions.invoke("draw", { body: { verify: true, random: s.random, signature: s.signature } });
      if ((data as any)?.authentic) ok++;
    }
    const multi = items.length > 1;
    setVerifyMsg(ok === items.length
      ? (multi ? `✓ All ${items.length} rounds verified by Random.org` : "✓ Verified authentic by Random.org")
      : `${ok}/${items.length} verified`);
  }, []);

  useEffect(() => { if (rec) runVerify(rec); }, [rec, runVerify]);

  function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        (navigator as any).share({ title: "Loot Vault winner", url });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(url); setShareMsg("Link copied ✓");
      }
    } catch { setShareMsg("Copy the link from your browser bar"); }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  if (err || !rec) {
    return (
      <View style={styles.center}>
        <Image source={LOGO} style={styles.smallLogo} resizeMode="contain" />
        <Text style={styles.muted}>{err ?? "Record not found."}</Text>
        <TouchableOpacity onPress={goBack}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.inner}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brand}>LOOT VAULT</Text>
        <Text style={styles.tagline}>Provably-fair draw record</Text>

        <View style={styles.card}>
          {rec.cover_url
            ? <Image source={{ uri: rec.cover_url }} style={styles.cover} />
            : <LinearGradient colors={[colors.navy, colors.bg]} style={styles.cover} />}
          <View style={styles.cardPad}>
            <Text style={styles.raffleTitle}>{rec.title}</Text>
            {rec.prize ? <Text style={styles.prize}>🏆 {rec.prize}</Text> : null}

            <Text style={styles.eyebrow}>WINNER</Text>
            <Text style={styles.winner}>{rec.winner_name}</Text>
            <Text style={styles.seat}>Seat #{rec.winning_seat} · {rec.entrants} entrants</Text>

            {rec.randomorg_signed && (
              <View style={styles.cert}>
                <Text style={styles.certTitle}>Random.org Signed Draw</Text>
                <Row k="Entrants" v={String(rec.entrants)} colors={colors} />
                {rec.rounds?.length
                  ? <Row k="Rounds" v={String(rec.rounds.length)} colors={colors} />
                  : <Row k="Winning number" v={String(rec.randomorg_signed?.random?.data?.[0] ?? rec.winning_seat)} colors={colors} />}
                <Row k="Winning seat" v={`#${rec.winning_seat}`} colors={colors} />
                <Row k="Drawn" v={new Date(rec.drawn_at).toLocaleString()} colors={colors} />
                <Text style={[styles.verifyMsg, verifyMsg?.startsWith("✓") && { color: colors.green }]}>
                  {verifyMsg ?? "Verifying…"}
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.shareBtn} onPress={share}>
              <Text style={styles.shareBtnText}>{shareMsg ?? "Share this result"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity onPress={() => Linking.openURL("https://www.random.org/")}>
          <Text style={styles.poweredBy}>Powered by Random.org true randomness</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Row({ k, v, colors }: { k: string; v: string; colors: AppColors }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{k}</Text>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{v}</Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 10, padding: 24 },
  muted: { color: colors.muted, textAlign: "center" },
  smallLogo: { width: 80, height: 80 },
  content: { padding: 20, alignItems: "center" },
  topbar: { width: "100%", maxWidth: 460, alignSelf: "center", marginBottom: 8 },
  backLink: { color: colors.red, fontSize: 15, fontWeight: "700" },
  inner: { width: "100%", maxWidth: 460, alignItems: "center" },
  logo: { width: 84, height: 84 },
  brand: { color: colors.text, fontSize: 20, fontWeight: "900", letterSpacing: 1, marginTop: 8 },
  tagline: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 18 },
  card: { width: "100%", backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, overflow: "hidden" },
  cover: { width: "100%", height: 180 },
  cardPad: { padding: 20, alignItems: "center" },
  raffleTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  prize: { color: colors.muted, fontSize: 14, marginTop: 4, textAlign: "center" },
  eyebrow: { color: colors.red, fontSize: 12, fontWeight: "900", letterSpacing: 2, marginTop: 18 },
  winner: { color: colors.text, fontSize: 32, fontWeight: "900", marginTop: 6, textAlign: "center" },
  seat: { color: colors.muted, fontSize: 14, marginTop: 4 },
  cert: { width: "100%", backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 14, marginTop: 18 },
  certTitle: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  verifyMsg: { color: colors.muted, fontSize: 13, fontWeight: "800", marginTop: 10 },
  shareBtn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 28, marginTop: 18, alignSelf: "stretch", alignItems: "center" },
  shareBtnText: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
  poweredBy: { color: colors.faint, fontSize: 12, marginTop: 18, textDecorationLine: "underline" },
});
