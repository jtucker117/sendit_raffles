// Cover image picker. Tap to choose from the library (all platforms); on web you
// can also drag & drop an image file onto it. Handles the upload and hands back
// the public URL via onChange.
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Alert } from "react-native";
import { useTheme } from "@/lib/theme-context";
import { radius, AppColors } from "@/lib/theme";
import { pickAndUploadImage, uploadImageBlob } from "@/lib/upload";

export function CoverPicker({
  bucket, userId, value, onChange, aspect, height = 140, disabled,
}: {
  bucket: "avatars" | "covers";
  userId: string;
  value: string | null;
  onChange: (url: string) => void;
  aspect?: [number, number];
  height?: number;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<View>(null);

  async function pick() {
    if (disabled || uploading) return;
    try {
      setUploading(true);
      const url = await pickAndUploadImage(bucket, userId, aspect);
      if (url) onChange(url);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Try again.");
    } finally {
      setUploading(false);
    }
  }

  // Web-only drag & drop: attach DOM listeners to the underlying element.
  useEffect(() => {
    if (Platform.OS !== "web" || disabled) return;
    const node = ref.current as any;
    if (!node?.addEventListener) return;
    const stop = (e: any) => { e.preventDefault(); e.stopPropagation(); };
    const onOver = (e: any) => { stop(e); setDragging(true); };
    const onLeave = (e: any) => { stop(e); setDragging(false); };
    const onDrop = async (e: any) => {
      stop(e); setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!file.type?.startsWith("image/")) { Alert.alert("Not an image", "Drop a JPG, PNG, or similar image file."); return; }
      try {
        setUploading(true);
        const url = await uploadImageBlob(bucket, userId, file, file.name);
        onChange(url);
      } catch (err: any) {
        Alert.alert("Upload failed", err?.message ?? "Try again.");
      } finally {
        setUploading(false);
      }
    };
    node.addEventListener("dragover", onOver);
    node.addEventListener("dragenter", onOver);
    node.addEventListener("dragleave", onLeave);
    node.addEventListener("drop", onDrop);
    return () => {
      node.removeEventListener("dragover", onOver);
      node.removeEventListener("dragenter", onOver);
      node.removeEventListener("dragleave", onLeave);
      node.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, userId, disabled]);

  const dragHint = Platform.OS === "web" ? " · or drag & drop" : "";

  return (
    <TouchableOpacity
      ref={ref}
      activeOpacity={0.85}
      onPress={pick}
      disabled={disabled || uploading}
      style={[styles.box, { height }, dragging && styles.boxDrag, disabled && { opacity: 0.5 }]}
    >
      {value ? (
        <>
          <Image source={{ uri: value }} style={styles.img} blurRadius={18} />
          <Image source={{ uri: value }} style={styles.imgFront} resizeMode="contain" />
        </>
      ) : null}
      {uploading ? (
        <View style={styles.center}><ActivityIndicator color={colors.red} /></View>
      ) : value ? (
        <View style={styles.caption}><Text style={styles.captionText}>{dragging ? "Drop to replace" : "Tap to change" + dragHint}</Text></View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.text}>{dragging ? "Drop image here" : "📷 Add cover" + dragHint}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  box: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  boxDrag: { borderColor: colors.red, borderWidth: 2, borderStyle: "dashed", backgroundColor: colors.redSoft },
  img: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  imgFront: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 12 },
  text: { color: colors.muted, fontSize: 14, textAlign: "center" },
  caption: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.45)", paddingVertical: 6, alignItems: "center" },
  captionText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
