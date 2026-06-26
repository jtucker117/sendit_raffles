import { useState, useCallback, useMemo, useEffect } from "react";
import {
  View, Text, Image, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { pickAndUploadImage } from "@/lib/upload";
import { useHostRaffles } from "@/lib/use-host-raffles";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";
import { RaffleGrid } from "@/components/RaffleGrid";

export default function Profile() {
  const { user, refreshProfile, signOut } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const isHost = user?.role === "host";
  const { raffles, loading: rafflesLoading, reload: reloadRaffles } = useHostRaffles(isHost ? user?.id : undefined);
  useFocusEffect(useCallback(() => { reloadRaffles(); }, [reloadRaffles]));

  const [uploading, setUploading] = useState<null | "avatar" | "cover">(null);
  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [savingBio, setSavingBio] = useState(false);

  // Host payment handles (where players send money at checkout)
  const [pay, setPay] = useState({ venmo: "", cashapp: "", paypal: "", zelle: "" });
  const [savingPay, setSavingPay] = useState(false);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  useEffect(() => {
    if (user?.role !== "host" || !user?.id) return;
    supabase.from("profiles").select("pay_venmo, pay_cashapp, pay_paypal, pay_zelle").eq("id", user.id).single()
      .then(({ data }) => {
        if (data) setPay({ venmo: data.pay_venmo ?? "", cashapp: data.pay_cashapp ?? "", paypal: data.pay_paypal ?? "", zelle: data.pay_zelle ?? "" });
      });
  }, [user?.id, user?.role]);

  async function savePay() {
    setSavingPay(true); setPayMsg(null);
    const { error } = await supabase.from("profiles").update({
      pay_venmo: pay.venmo.trim() || null, pay_cashapp: pay.cashapp.trim() || null,
      pay_paypal: pay.paypal.trim() || null, pay_zelle: pay.zelle.trim() || null,
    }).eq("id", user!.id);
    setPayMsg(error ? "Couldn't save" : "Saved ✓");
    setSavingPay(false);
  }

  // Player stats + winnings
  const [stats, setStats] = useState({ entered: 0, won: 0, spentCents: 0 });
  const [winnings, setWinnings] = useState<{ raffleId: string; title: string; prize: string | null; cover_url: string | null }[]>([]);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    if (!user) return;
    (async () => {
      const { data: tix } = await supabase.from("tickets").select("raffle_id, type, status, raffles(amount_cents)").eq("owner_id", user.id);
      const rids = new Set<string>(); let spent = 0;
      (tix ?? []).forEach((t: any) => { rids.add(t.raffle_id); if (t.type === "paid" && t.status === "confirmed") spent += t.raffles?.amount_cents ?? 0; });
      const { data: wins } = await supabase.from("draws").select("raffle_id, raffles(id, title, prize, cover_url)").eq("winner_id", user.id);
      setStats({ entered: rids.size, won: (wins ?? []).length, spentCents: spent });
      setWinnings((wins ?? []).map((w: any) => ({ raffleId: w.raffle_id, title: w.raffles?.title ?? "Raffle", prize: w.raffles?.prize ?? null, cover_url: w.raffles?.cover_url ?? null })));
      const { data: p } = await supabase.from("profiles").select("created_at").eq("id", user.id).single();
      setMemberSince(p?.created_at ?? null);
    })();
  }, [user?.id]));

  if (!user) {
    return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  }

  async function changePhoto(kind: "avatar" | "cover") {
    try {
      setUploading(kind);
      const url = await pickAndUploadImage(
        kind === "avatar" ? "avatars" : "covers",
        user!.id,
        kind === "avatar" ? [1, 1] : [16, 9],
      );
      if (!url) return; // canceled
      const col = kind === "avatar" ? "avatar_url" : "cover_url";
      const { error } = await supabase.from("profiles").update({ [col]: url }).eq("id", user!.id);
      if (error) throw error;
      await refreshProfile();
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Please try again.");
    } finally {
      setUploading(null);
    }
  }

  async function saveBio() {
    try {
      setSavingBio(true);
      const { error } = await supabase.from("profiles").update({ bio }).eq("id", user!.id);
      if (error) throw error;
      await refreshProfile();
      setEditingBio(false);
    } catch (e: any) {
      Alert.alert("Couldn't save bio", e?.message ?? "Please try again.");
    } finally {
      setSavingBio(false);
    }
  }

  const hostStatus = isHost
    ? user.host_approved === true ? " · Approved"
      : user.host_approved === null ? " · Pending" : " · Not approved"
    : "";

  return (
    <View style={styles.container}>
    <ScrollView contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      {/* Cover photo */}
      <View style={styles.coverWrap}>
        {user.cover_url
          ? <Image source={{ uri: user.cover_url }} style={styles.cover} />
          : <View style={[styles.cover, styles.coverPlaceholder]} />}
        <TouchableOpacity style={styles.coverBtn} onPress={() => changePhoto("cover")} disabled={uploading !== null}>
          <Text style={styles.coverBtnText}>{uploading === "cover" ? "Uploading…" : "📷 Edit cover"}</Text>
        </TouchableOpacity>
      </View>

      {/* Avatar + identity */}
      <View style={styles.identity}>
        <TouchableOpacity style={styles.avatarWrap} onPress={() => changePhoto("avatar")} disabled={uploading !== null}>
          {user.avatar_url
            ? <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>{user.display_name?.[0]?.toUpperCase() ?? "?"}</Text>
              </View>}
          <View style={styles.avatarBadge}>
            <Text style={styles.avatarBadgeText}>{uploading === "avatar" ? "…" : "✎"}</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.name}>{user.display_name}</Text>
        <Text style={styles.role}>{isHost ? "🎡 Host" : "🎫 Player"}{hostStatus}{memberSince ? ` · member since ${new Date(memberSince).getFullYear()}` : ""}</Text>

        {/* Player stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}><Text style={styles.statVal}>{stats.entered}</Text><Text style={styles.statLabel}>Entered</Text></View>
          <View style={styles.statBox}><Text style={[styles.statVal, { color: colors.red }]}>{stats.won}</Text><Text style={styles.statLabel}>Won</Text></View>
          <View style={styles.statBox}><Text style={styles.statVal}>${(stats.spentCents / 100).toFixed(0)}</Text><Text style={styles.statLabel}>Spent</Text></View>
        </View>

        {isHost && user.host_code ? (
          <View style={styles.codeChip}>
            <Text style={styles.codeLabel}>YOUR HOST CODE</Text>
            <Text style={styles.codeValue}>{user.host_code}</Text>
            <Text style={styles.codeHint}>Share this so players can follow you</Text>
          </View>
        ) : null}

        {/* Bio */}
        {editingBio ? (
          <View style={styles.bioEdit}>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Tell players about yourself…"
              placeholderTextColor={colors.faint}
              multiline
              style={styles.bioInput}
            />
            <View style={styles.bioActions}>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.red }]} onPress={saveBio} disabled={savingBio}>
                <Text style={styles.smallBtnText}>{savingBio ? "Saving…" : "Save"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, styles.smallBtnGhost]} onPress={() => { setBio(user.bio ?? ""); setEditingBio(false); }}>
                <Text style={[styles.smallBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditingBio(true)}>
            <Text style={[styles.bio, !user.bio?.trim() && styles.bioMuted]}>
              {user.bio?.trim() ? user.bio : "＋ Add a bio"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Payment handles (host) */}
      {isHost && (
        <View style={styles.feed}>
          <Text style={styles.feedTitle}>Payment handles</Text>
          <Text style={styles.payHint}>Shown to players at checkout so they know where to send payment. Leave blank to hide a method.</Text>
          <View style={styles.payGrid}>
            {([["venmo", "Venmo", "@your-venmo"], ["cashapp", "Cash App", "$yourcashtag"], ["paypal", "PayPal", "you@email.com / paypal.me link"], ["zelle", "Zelle", "email or phone"]] as const).map(([key, label, ph]) => (
              <View key={key} style={styles.payField}>
                <Text style={styles.payLabel}>{label}</Text>
                <TextInput
                  style={styles.payInput}
                  value={(pay as any)[key]}
                  onChangeText={(t) => { setPay((p) => ({ ...p, [key]: t })); setPayMsg(null); }}
                  placeholder={ph}
                  placeholderTextColor={colors.faint}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            ))}
          </View>
          <View style={styles.payActions}>
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.red }]} onPress={savePay} disabled={savingPay}>
              <Text style={styles.smallBtnText}>{savingPay ? "Saving…" : "Save handles"}</Text>
            </TouchableOpacity>
            {payMsg && <Text style={styles.payMsg}>{payMsg}</Text>}
          </View>
        </View>
      )}

      {/* My winnings */}
      {winnings.length > 0 && (
        <View style={styles.feed}>
          <Text style={styles.feedTitle}>My winnings</Text>
          {winnings.map((w) => (
            <TouchableOpacity key={w.raffleId} style={styles.winRow} activeOpacity={0.9} onPress={() => router.push(`/raffle/${w.raffleId}`)}>
              {w.cover_url
                ? <Image source={{ uri: w.cover_url }} style={styles.winThumb} />
                : <View style={[styles.winThumb, { backgroundColor: colors.navy }]} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.winTitle} numberOfLines={1}>{w.title}</Text>
                {w.prize ? <Text style={styles.winPrize} numberOfLines={1}>🏆 {w.prize}</Text> : null}
              </View>
              <View style={styles.winBadge}><Text style={styles.winBadgeText}>WON</Text></View>
            </TouchableOpacity>
          ))}
          <Text style={styles.claimNote}>Contact the host to arrange your prize.</Text>
        </View>
      )}

      {/* Host feed of raffles */}
      {isHost && (
        <View style={styles.feed}>
          <Text style={styles.feedTitle}>Raffles</Text>
          {rafflesLoading ? (
            <ActivityIndicator color={colors.red} style={{ marginTop: 16 }} />
          ) : raffles.length === 0 ? (
            <Text style={styles.empty}>No raffles yet — create your first one from Home.</Text>
          ) : (
            <RaffleGrid raffles={raffles as any} onPress={(id) => router.push(`/raffle/${id}`)} />
          )}
        </View>
      )}

      <TouchableOpacity style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
    </View>
  );
}

const COVER_H = 170;
const AVATAR = 96;

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },

  coverWrap: { height: COVER_H, backgroundColor: colors.surfaceAlt },
  cover: { width: "100%", height: COVER_H },
  coverPlaceholder: { backgroundColor: colors.navy },
  coverBtn: { position: "absolute", right: 12, bottom: 12, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  coverBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  identity: { alignItems: "center", paddingHorizontal: 20, marginTop: -AVATAR / 2 },
  avatarWrap: { width: AVATAR, height: AVATAR },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, borderWidth: 4, borderColor: colors.bg, backgroundColor: colors.surface },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: colors.navy },
  avatarInitial: { color: "#fff", fontSize: 36, fontWeight: "800" },
  avatarBadge: { position: "absolute", right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.red, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.bg },
  avatarBadgeText: { color: colors.onAccent, fontSize: 13 },

  name: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 10, letterSpacing: -0.3 },
  role: { color: colors.muted, fontSize: 14, marginTop: 2 },
  codeChip: { alignItems: "center", marginTop: 14, backgroundColor: colors.surfaceAlt, borderColor: colors.red, borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 18 },
  codeLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  codeValue: { color: colors.red, fontSize: 22, fontWeight: "800", letterSpacing: 3, marginTop: 2 },
  codeHint: { color: colors.faint, fontSize: 11, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 16, width: "100%", maxWidth: 460 },
  statBox: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  statVal: { color: colors.text, fontSize: 22, fontWeight: "900" },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  winRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderColor: colors.red, borderWidth: 1, borderRadius: radius.md, padding: 10, marginBottom: 10 },
  winThumb: { width: 52, height: 52, borderRadius: 10 },
  winTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  winPrize: { color: colors.muted, fontSize: 12, marginTop: 2 },
  winBadge: { backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  winBadgeText: { color: colors.onAccent, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  claimNote: { color: colors.faint, fontSize: 12, marginTop: 2 },
  payCard: { width: "100%", maxWidth: 460, marginTop: 16, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  payTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  payHint: { color: colors.faint, fontSize: 11, lineHeight: 15, marginTop: 4, marginBottom: 8 },
  payRow: { marginTop: 8 },
  payGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  payField: { flexGrow: 1, flexBasis: "44%", minWidth: 200 },
  payLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 5 },
  payInput: { backgroundColor: colors.surfaceAlt, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: radius.md, padding: 10, color: colors.text, fontSize: 14 },
  payActions: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  payMsg: { color: colors.green, fontSize: 13, fontWeight: "700" },

  bio: { color: colors.text, fontSize: 14, textAlign: "center", marginTop: 12, lineHeight: 20, maxWidth: 460 },
  bioMuted: { color: colors.red, fontWeight: "600" },
  bioEdit: { width: "100%", marginTop: 12 },
  bioInput: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, color: colors.text, fontSize: 14, minHeight: 80, textAlignVertical: "top" },
  bioActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  smallBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.md },
  smallBtnGhost: { borderWidth: 1, borderColor: colors.border },
  smallBtnText: { color: colors.onAccent, fontWeight: "700", fontSize: 14 },

  feed: { paddingHorizontal: 20, marginTop: 28 },
  feedTitle: { color: colors.text, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 },
  empty: { color: colors.muted, fontSize: 14, marginTop: 4 },
  raffleCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 14 },
  raffleCover: { width: "100%", height: 120 },
  raffleBody: { padding: 14 },
  raffleTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  rafflePrize: { color: colors.muted, fontSize: 13, marginTop: 4 },
  raffleMeta: { color: colors.faint, fontSize: 12, marginTop: 6, textTransform: "capitalize" },

  backBtn: { alignSelf: "center", marginTop: 26, paddingVertical: 10, paddingHorizontal: 20 },
  backText: { color: colors.red, fontSize: 15, fontWeight: "600" },
  signOut: { alignSelf: "center", marginTop: 26, paddingVertical: 12, paddingHorizontal: 28, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  signOutText: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
