import { supabase } from "./supabase.js";
import { prepareGroomPhotoFiles } from "./imageProcess.js";

const BUCKET = "groom-photos";
const JPEG = "image/jpeg";

/** Default signed URL lifetime (1 hour). Refreshed from cache before expiry. */
const DEFAULT_EXPIRES = 3600;
/** Refresh when less than this many seconds remain. */
const REFRESH_BUFFER_SEC = 600;

const urlCache = new Map();

/** Derive thumbnail storage path from full photo path. */
export function thumbPathFor(fullPath) {
  if (!fullPath || !isPhotoStoragePath(fullPath)) return null;
  const dot = fullPath.lastIndexOf(".");
  if (dot === -1) return `${fullPath}_thumb`;
  return `${fullPath.slice(0, dot)}_thumb${fullPath.slice(dot)}`;
}

function cacheEntry(path, url, expiresIn) {
  urlCache.set(path, {
    url,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return url;
}

function cachedUrl(path) {
  const entry = urlCache.get(path);
  if (!entry) return null;
  const remainingMs = entry.expiresAt - Date.now();
  if (remainingMs <= REFRESH_BUFFER_SEC * 1000) return null;
  return entry.url;
}

/** Upload compressed full + thumbnail; returns main storage path. */
export async function uploadGroomPhoto({ dogId, appointmentId, file }) {
  const { full, thumb } = await prepareGroomPhotoFiles(file);
  const ts = Date.now();
  const path = `${dogId}/${appointmentId}/${ts}.jpg`;
  const thumbPath = `${dogId}/${appointmentId}/${ts}_thumb.jpg`;

  const uploads = [
    supabase.storage.from(BUCKET).upload(path, full, { upsert: true, contentType: JPEG }),
    supabase.storage.from(BUCKET).upload(thumbPath, thumb, { upsert: true, contentType: JPEG }),
  ];
  const [mainRes, thumbRes] = await Promise.all(uploads);
  if (mainRes.error) throw mainRes.error;
  if (thumbRes.error) throw thumbRes.error;

  urlCache.delete(path);
  urlCache.delete(thumbPath);
  return path;
}

export function isPhotoStoragePath(value) {
  return Boolean(value && value !== "pending" && !value.startsWith("http"));
}

/** Signed URL for private bucket display / SMS link. */
export async function getGroomPhotoSignedUrl(storagePath, expiresIn = DEFAULT_EXPIRES) {
  if (!isPhotoStoragePath(storagePath)) return null;

  const hit = cachedUrl(storagePath);
  if (hit) return hit;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw new Error(error.message || "Could not create photo link.");
  const signed = data?.signedUrl || null;
  if (signed) cacheEntry(storagePath, signed, expiresIn);
  return signed;
}

/** Display URL: signed link first, then authenticated download as blob. */
export async function getGroomPhotoDisplayUrl(storagePath, expiresIn = DEFAULT_EXPIRES) {
  if (!isPhotoStoragePath(storagePath)) return null;

  const hit = cachedUrl(storagePath);
  if (hit) return hit;

  try {
    const signed = await getGroomPhotoSignedUrl(storagePath, expiresIn);
    if (signed) return signed;
  } catch {
    /* fall through */
  }
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(error?.message || "Could not load photo from storage.");
  }
  const blobUrl = URL.createObjectURL(data);
  cacheEntry(storagePath, blobUrl, expiresIn);
  return blobUrl;
}

/** Card thumbnail first, then full image fallback. */
export async function getGroomPhotoThumbUrl(fullPath, expiresIn = DEFAULT_EXPIRES) {
  const thumb = thumbPathFor(fullPath);
  if (!thumb) return null;
  try {
    const url = await getGroomPhotoDisplayUrl(thumb, expiresIn);
    if (url) return url;
  } catch {
    /* older uploads without thumb */
  }
  return getGroomPhotoDisplayUrl(fullPath, expiresIn);
}

export async function signPhotoPathMap(paths, expiresIn = DEFAULT_EXPIRES) {
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

/** Sign full + thumb URLs for board rows. */
export async function signPhotoDisplayMap(paths, expiresIn = DEFAULT_EXPIRES) {
  const uniq = [...new Set((paths || []).filter(isPhotoStoragePath))];
  const full = {};
  const thumb = {};
  await Promise.all(
    uniq.map(async (p) => {
      try {
        full[p] = await getGroomPhotoDisplayUrl(p, expiresIn);
        thumb[p] = await getGroomPhotoThumbUrl(p, expiresIn);
      } catch {
        full[p] = null;
        thumb[p] = null;
      }
    })
  );
  return { full, thumb };
}

/** Periodically refresh cached URLs so images don't 403 after expiry. */
export function startPhotoUrlRefreshLoop(intervalMs = 45 * 60 * 1000) {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [path, entry] of urlCache.entries()) {
      if (entry.expiresAt - now <= REFRESH_BUFFER_SEC * 1000) {
        getGroomPhotoDisplayUrl(path).catch(() => {});
      }
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
