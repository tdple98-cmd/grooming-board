/**
 * Keep long-lived home-screen sessions on the latest deploy.
 * Staff save the board to their phone and rarely reload it, so new builds
 * used to sit unseen until someone killed the app. This polls the served
 * index.html, compares the built bundle hash to the one currently running,
 * and reloads when they differ — immediately on app resume, and every few
 * minutes in the background. Never reloads mid-typing.
 */

const CHECK_EVERY_MS = 5 * 60 * 1000;
const RETRY_WHILE_TYPING_MS = 60 * 1000;

function bundleHashFrom(html) {
  const m = String(html || "").match(/assets\/index-([\w-]+)\.js/);
  return m ? m[1] : null;
}

function currentBundleHash() {
  const script = document.querySelector('script[type="module"][src*="assets/index-"]');
  return bundleHashFrom(script?.getAttribute("src") || "");
}

function staffIsTyping() {
  const el = document.activeElement;
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function startAutoUpdate() {
  const running = currentBundleHash();
  if (!running) return; // dev server — hashes only exist in production builds

  let reloading = false;

  const reloadWhenSafe = () => {
    if (reloading) return;
    if (staffIsTyping()) {
      setTimeout(reloadWhenSafe, RETRY_WHILE_TYPING_MS);
      return;
    }
    reloading = true;
    window.location.reload();
  };

  const check = async () => {
    if (reloading) return;
    try {
      const res = await fetch(`/?update-check=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const latest = bundleHashFrom(await res.text());
      if (latest && latest !== running) reloadWhenSafe();
    } catch {
      /* offline — realtime layer surfaces that; try again next tick */
    }
  };

  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
}
