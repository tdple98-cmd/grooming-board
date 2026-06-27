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
  if (error) throw new Error(error.message || "Could not create photo link.");
  return data?.signedUrl || null;
}

/** Display URL: signed link first, then authenticated download as blob (same session as upload). */
export async function getGroomPhotoDisplayUrl(storagePath, expiresIn = 3600) {
  if (!isPhotoStoragePath(storagePath)) return null;
  try {
    const signed = await getGroomPhotoSignedUrl(storagePath, expiresIn);
    if (signed) return signed;
  } catch {
    /* fall through to download */
  }
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(error?.message || "Could not load photo from storage.");
  }
  return URL.createObjectURL(data);
}

export async function signPhotoPathMap(paths, expiresIn = 3600) {
  const uniq = [...new Set((paths || []).filter(isPhotoStoragePath))];
  const map = {};
  await Promise.all(
    uniq.map(async (p) => {
      try {
        map[p] = await getGroomPhotoDisplayUrl(p, expiresIn);
      } catch {
        map[p] = null;
      }
    })
  );
  return map;
}
