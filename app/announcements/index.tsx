import { useCallback, useMemo, useState } from "react";
import {
  View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { pickAndUploadImage } from "@/lib/upload";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

interface Ann { id: string; title: string | null; content: string; image_url: string | null; created_at: string; }

export default function Announcements() {
  const router = useRouter();
  const { user, isSuperadmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [list, setList] = useState<Ann[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [xEveryone, setXEveryone] = useState(false);
  const [xHosts, setXHosts] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("announcements").select("id, title, content, image_url, created_at").order("created_at", { ascending: false });
    setList((data ?? []) as Ann[]);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function addImage() {
    try {
      setUploading(true);
      const url = await pickAndUploadImage("covers", user!.id); // no aspect = full screenshot
      if (url) setImage(url);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Try again.");
    } finally { setUploading(false); }
  }

  async function post() {
    if (!body.trim() && !title.trim()) { Alert.alert("Add a title or message"); return; }
    setPosting(true);
    const { error } = await supabase.from("announcements").insert({
      author_id: user!.id, title: title.trim() || null, content: body.trim(), image_url: image,
    });
    if (error) { Alert.alert("Couldn't post", error.message); setPosting(false); return; }
    // Optionally cross-post into the platform group(s) so people can reply there.
    const rooms: string[] = [];
    if (xEveryone) rooms.push("everyone");
    if (xHosts) rooms.push("hosts");
    if (rooms.length) {
      const msg = `📢 ${title.trim() || "Announcement"}${body.trim() ? `\n\n${body.trim()}` : ""}`;
      await supabase.from("platform_chat").insert(rooms.map((room) => ({ room, author_id: user!.id, content: msg })));
    }
    setTitle(""); setBody(""); setImage(null); setXEveryone(false); setXHosts(false); await load();
    setPosting(false);
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.red} />}
      >
        <View style={styles.titleRow}>
          <Ionicons name="megaphone" size={24} color={colors.red} />
          <Text style={styles.h1}>Announcements</Text>
        </View>
        <Text style={styles.sub}>Updates & changes to Loot Vault</Text>

        {/* Superadmin composer */}
        {isSuperadmin && (
          <View style={styles.composer}>
            <TextInput style={styles.input} placeholder="Title (e.g. New: Last Man Standing draws)" placeholderTextColor={colors.faint} value={title} onChangeText={setTitle} />
            <TextInput style={[styles.input, styles.multiline]} placeholder="What changed / what's new…" placeholderTextColor={colors.faint} value={body} onChangeText={setBody} multiline />
            {image ? (
              <View style={styles.previewWrap}>
                <Image source={{ uri: image }} style={styles.preview} resizeMode="contain" />
                <TouchableOpacity style={styles.removeImg} onPress={() => setImage(null)}><Text style={styles.removeImgText}>✕ Remove</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addImg} onPress={addImage} disabled={uploading}>
                <Ionicons name="image-outline" size={18} color={colors.text} />
                <Text style={styles.addImgText}>{uploading ? "Uploading…" : "Add screenshot"}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.xLabel}>Also post to a group so people can reply:</Text>
            <View style={styles.xChips}>
              <TouchableOpacity style={[styles.xChip, xEveryone && styles.xChipOn]} onPress={() => setXEveryone((v) => !v)}>
                <Text style={[styles.xChipText, xEveryone && styles.xChipTextOn]}>{xEveryone ? "✓ " : ""}Community</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.xChip, xHosts && styles.xChipOn]} onPress={() => setXHosts((v) => !v)}>
                <Text style={[styles.xChipText, xHosts && styles.xChipTextOn]}>{xHosts ? "✓ " : ""}Hosts</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.postBtn, posting && { opacity: 0.5 }]} disabled={posting} onPress={post}>
              <Text style={styles.postText}>{posting ? "Posting…" : "Post announcement"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.red} style={{ marginTop: 30 }} />
        ) : list.length === 0 ? (
          <Text style={styles.empty}>No announcements yet.</Text>
        ) : (
          list.map((a) => (
            <TouchableOpacity key={a.id} style={styles.card} activeOpacity={0.9} onPress={() => router.push(`/messages/announcement/${a.id}`)}>
              {a.image_url ? <Image source={{ uri: a.image_url }} style={styles.thumb} resizeMode="cover" /> : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{a.title || "Update"}</Text>
                <Text style={styles.cardBody} numberOfLines={2}>{a.content}</Text>
                <Text style={styles.cardDate}>{new Date(a.created_at).toLocaleDateString()}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  h1: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.4 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 18 },
  composer: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 14, marginBottom: 18, gap: 10 },
  input: { backgroundColor: colors.surfaceAlt, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, color: colors.text, fontSize: 14 },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  addImg: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14 },
  addImgText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  previewWrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceAlt },
  preview: { width: "100%", height: 200 },
  removeImg: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  removeImgText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  xLabel: { color: colors.muted, fontSize: 12.5, fontWeight: "600" },
  xChips: { flexDirection: "row", gap: 8 },
  xChip: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.surfaceAlt },
  xChipOn: { backgroundColor: colors.redSoft, borderColor: colors.red },
  xChipText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  xChipTextOn: { color: colors.text },
  postBtn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 13, alignItems: "center" },
  postText: { color: colors.onAccent, fontWeight: "800", fontSize: 14 },
  empty: { color: colors.muted, fontSize: 14, marginTop: 24, textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 10 },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cardBody: { color: colors.muted, fontSize: 13, marginTop: 2 },
  cardDate: { color: colors.faint, fontSize: 11, marginTop: 6 },
});
