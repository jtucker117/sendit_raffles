import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

// Pick an image from the library and upload it to a public Supabase Storage
// bucket under the user's own folder (`<userId>/<timestamp>.<ext>`), which the
// storage RLS policies allow. Returns the public URL, or null if canceled.
export async function pickAndUploadImage(
  bucket: "avatars" | "covers",
  userId: string,
  aspect?: [number, number], // omit to upload the full image uncropped (e.g. screenshots)
): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") {
    throw new Error("Photo library permission is required to upload.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: !!aspect,
    aspect,
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  const ext = (asset.fileName?.split(".").pop() || asset.uri.split(".").pop() || "jpg")
    .split("?")[0]
    .toLowerCase()
    .slice(0, 4);
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// Upload an already-obtained Blob/File (e.g. from a web drag-and-drop) straight
// to storage. Returns the public URL.
export async function uploadImageBlob(
  bucket: "avatars" | "covers",
  userId: string,
  blob: Blob,
  filename?: string,
): Promise<string> {
  const ext = (filename?.split(".").pop() || blob.type?.split("/")[1] || "jpg")
    .split("?")[0]
    .toLowerCase()
    .slice(0, 4);
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
