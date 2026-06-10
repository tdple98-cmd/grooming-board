/** In-memory snapshot from the landing URL (same page load only — not localStorage). */
let urlTypeSnapshot = null;

/** Read type=invite|recovery from the current URL hash or query string. */
export function readAuthTypeFromUrl() {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash) {
    const type = new URLSearchParams(hash).get("type");
    if (type === "invite" || type === "recovery") return type;
  }

  const search = window.location.search;
  if (search) {
    const type = new URLSearchParams(search).get("type");
    if (type === "invite" || type === "recovery") return type;
  }

  return null;
}

/** Call once before Supabase clears the hash on first load. */
export function primeAuthTypeFromUrl() {
  urlTypeSnapshot = readAuthTypeFromUrl();
  return urlTypeSnapshot;
}

/** URL intent now, else snapshot from when the page first loaded. */
export function getAuthType() {
  return readAuthTypeFromUrl() || urlTypeSnapshot;
}

export function clearAuthType() {
  urlTypeSnapshot = null;
}

export function requiresPasswordSetup(type) {
  return type === "invite" || type === "recovery";
}
