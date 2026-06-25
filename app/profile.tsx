import { useState } from "react";
import {
  View, Text, Image, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { pickAndUploadImage } from "@/lib/upload";
import { useHostRaffles } from "@/lib/use-host-raffles";
import { colors, radius } from "@/lib/theme";

export default function Profile() {
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  const isHost = user?.role === "host";
  const { raffles, loading: rafflesLoading } = useHostRaffles(isHost ? user?.id : undefined);

  const [uploading, setUploading] = useState<null | "avatar" | "cover">(null);
  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [savingBio, setSavingBio] = useState(false);

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
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
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
        <Text style={styles.role}>{isHost ? "🎡 Host" : "🎫 Player"}{hostStatus}</Text>

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

      {/* Host feed of raffles */}
      {isHost && (
        <View style={styles.feed}>
          <Text style={styles.feedTitle}>Raffles</Text>
          {rafflesLoading ? (
            <ActivityIndicator color={colors.red} style={{ marginTop: 16 }} />
          ) : raffles.length === 0 ? (
            <Text style={styles.empty}>No raffles yet — create your first one from Home.</Text>
          ) : (
            raffles.map((r) => (
              <View key={r.id} style={styles.raffleCard}>
                {r.cover_url ? <Image source={{ uri: r.cover_url }} style={styles.raffleCover} /> : null}
                <View style={styles.raffleBody}>
                  <Text style={styles.raffleTitle}>{r.title}</Text>
                  {r.prize ? <Text style={styles.rafflePrize}>🏆 {r.prize}</Text> : null}
                  <Text style={styles.raffleMeta}>{r.status} · {r.capacity} seats</Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const COVER_H = 170;
const AVATAR = 96;

const styles = StyleSheet.create({
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
});
