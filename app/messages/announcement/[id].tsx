import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { radius, AppColors } from "@/lib/theme";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomNav";

interface Ann { id: string; title: string | null; content: string; image_url: string | null; created_at: string; }

export default function AnnouncementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isSuperadmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [ann, setAnn] = useState<Ann | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("announcements").select("id, title, content, image_url, created_at").eq("id", id).maybeSingle();
    setAnn((data as Ann) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function del() {
    if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); return; }
    const { error } = await supabase.from("announcements").delete().eq("id", ann!.id);
    if (error) { Alert.alert("Delete failed", error.message); return; }
    router.back();
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  if (!ann) return <View style={styles.center}><Text style={styles.muted}>Announcement not found.</Text></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.eyebrow}>LOOT VAULT UPDATE</Text>
      {ann.title ? <Text style={styles.title}>{ann.title}</Text> : null}
      <Text style={styles.date}>{new Date(ann.created_at).toLocaleString()}</Text>

      {ann.image_url ? (
        <TouchableOpacity activeOpacity={0.9} onPress={() => Linking.openURL(ann.image_url!)}>
          <Image source={{ uri: ann.image_url }} style={styles.image} resizeMode="contain" />
          <Text style={styles.imageHint}>Tap image to view full size</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.body}>{ann.content}</Text>

      {isSuperadmin && (
        <TouchableOpacity style={styles.delBtn} onPress={del}>
          <Text style={styles.delText}>{confirmDel ? "Tap again to delete" : "Delete announcement"}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  muted: { color: colors.muted },
  back: { color: colors.red, fontSize: 15, fontWeight: "700", marginBottom: 14 },
  eyebrow: { color: colors.red, fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.3, marginTop: 6 },
  date: { color: colors.faint, fontSize: 12, marginTop: 6, marginBottom: 16 },
  image: { width: "100%", height: 360, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  imageHint: { color: colors.faint, fontSize: 11, textAlign: "center", marginTop: 6 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22, marginTop: 16 },
  delBtn: { marginTop: 28, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  delText: { color: colors.danger, fontWeight: "700", fontSize: 14 },
});
