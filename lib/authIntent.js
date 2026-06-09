const AUTH_INTENT_KEY = "grooming_board_auth_intent";

/** Read type=invite|recovery from URL before Supabase clears the hash. */
export function captureAuthIntentFromUrl() {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash) {
    const type = new URLSearchParams(hash).get("type");
    if (type === "invite" || type === "recovery") {
      sessionStorage.setItem(AUTH_INTENT_KEY, type);
      return type;
    }
  }

  const search = window.location.search;
  if (search) {
    const type = new URLSearchParams(search).get("type");
    if (type === "invite" || type === "recovery") {
      sessionStorage.setItem(AUTH_INTENT_KEY, type);
      return type;
    }
  }

  return sessionStorage.getItem(AUTH_INTENT_KEY);
}

export function getAuthIntent() {
  return sessionStorage.getItem(AUTH_INTENT_KEY);
}

export function clearAuthIntent() {
  sessionStorage.removeItem(AUTH_INTENT_KEY);
}

export function requiresPasswordSetup(type) {
  return type === "invite" || type === "recovery";
}
