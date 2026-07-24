/**
 * Server-to-server fetch of the reply-engine's per-date roster (the owner's real 8pm nightly
 * roster) — the same call api/roster.js proxies for the client, reused here so the owner
 * dashboard's groomer workload lists who's ACTUALLY rostered, not just whoever a booking happens
 * to name. Returns null (never throws) when unconfigured or unreachable — callers fall back to
 * booking-derived names so the section is never empty.
 */
export async function fetchRosterNames(dateStr) {
  const replyEngineUrl = (process.env.REPLY_ENGINE_URL || "").trim();
  const boardApiSecret = (process.env.BOARD_API_SECRET || "").trim();
  if (!replyEngineUrl || !boardApiSecret) return null;

  try {
    const res = await fetch(`${replyEngineUrl.replace(/\/$/, "")}/api/board/roster?date=${dateStr}`, {
      headers: { "X-Board-Secret": boardApiSecret },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.isDefault) return null; // owner hasn't set today's roster yet — nothing real to show
    const names = [...(data.groomers || []), ...(data.bathers || [])].map((s) => s.name).filter(Boolean);
    return names.length ? names : null;
  } catch {
    return null;
  }
}
