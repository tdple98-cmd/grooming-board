export function groomPhotoSrc(d, { preferThumb = false } = {}) {
  if (preferThumb) {
    return d?.groomPhotoThumbUrl || d?.groomPhotoUrl || d?.groomPhotoPreviewUrl || null;
  }
  return d?.groomPhotoUrl || d?.groomPhotoPreviewUrl || null;
}

export function isPlaceholderDogName(name, owner) {
  if (!name?.trim()) return true;
  const lower = name.toLowerCase().trim();
  if (["pet", "pets", "dog", "dogs", "puppy", "puppies", "animal", "animals"].includes(lower)) return true;
  if (/'s pet$/i.test(name) || /'s dog$/i.test(name)) return true;
  if (/^\d+\s*dogs?$/i.test(name)) return true;
  const given = (owner || "").trim().split(/\s+/)[0]?.toLowerCase();
  if (given && (lower === `${given}'s dog` || lower === `${given}'s dogs` || lower === `${given} dogs`)) return true;
  return false;
}

export function ownerFirstName(owner) {
  return (owner || "").trim().split(/\s+/)[0] || "there";
}

export function smsDogName(d) {
  return isPlaceholderDogName(d.dog, d.owner) ? "your Pups" : d.dog;
}

export function lastVisitPhotoSrc(v, d, { preferThumb = false } = {}) {
  if (preferThumb) {
    return v?.photoThumbUrl || v?.photoUrl || (d?.collected ? groomPhotoSrc(d, { preferThumb: true }) : null) || null;
  }
  return v?.photoUrl || (d?.collected ? groomPhotoSrc(d) : null) || null;
}

export const telHref = (p) => "tel:" + (p || "").replace(/\s+/g, "");
export const smsHref = (p, body) => "sms:" + (p || "").replace(/\s+/g, "") + "?&body=" + encodeURIComponent(body);

export const thirtyText = (d) =>
  "Hi " + ownerFirstName(d.owner) + " - " + smsDogName(d) + " will be ready in about 30 mins. Feel free to come now and collect your pup! - The Poodle Specialist";
export const pickupText = (d) =>
  "Hi " + ownerFirstName(d.owner) + " - " + smsDogName(d) + " is all done and ready for pickup. Come collect your pup whenever suits! - The Poodle Specialist";
export const photoText = (d, url) =>
  smsDogName(d) + " is all done and looking gorgeous! See the photo here: " + (url || "[link]") + " - The Poodle Specialist";

export function elapsed(since) {
  if (!since) return null;
  const m = Math.max(0, Math.floor((Date.now() - since) / 60000));
  const h = Math.floor(m / 60);
  return h > 0 ? h + "h " + (m % 60) + "m" : m + "m";
}
