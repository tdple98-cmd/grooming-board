import { supabase } from "./supabase.js";

const BUCKET = "groom-photos";
const ALLOWED = new Set(["jpg", "jpeg", "png", "webp"]);

function extFromFile(file) {
  const fromName = file.name?.split(".").pop()?.toLowerCase();
  if (fromName && ALLOWED.has(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  const mime = file.type?.split("/").pop()?.toLowerCase();
  if (mime && ALLOWED.has(mime)) return mime === "jpeg" ? "jpg" : mime;
  return "jpg";
}

/** Upload groom photo; returns storage path stored in appointments.groom_photo_url. */
export async function uploadGroomPhoto({ dogId, appointmentId, file }) {
  const ext = extFromFile(file);
  const path = `${dogId}/${appointmentId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
  });
  if (error) throw error;
  return path;
}

export function isPhotoStoragePath(value) {
  return Boolean(value && value !== "pending" && !value.startsWith("http"));
}

/** Signed URL for private bucket display / SMS link. */
export async function getGroomPhotoSignedUrl(storagePath, expiresIn = 3600) {
  if (!isPhotoStoragePath(storagePath)) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}

export async function signPhotoPathMap(paths, expiresIn = 3600) {
  const uniq = [...new Set((paths || []).filter(isPhotoStoragePath))];
  const map = {};
  await Promise.all(
    uniq.map(async (p) => {
      map[p] = await getGroomPhotoSignedUrl(p, expiresIn);
    })
  );
  return map;
}
