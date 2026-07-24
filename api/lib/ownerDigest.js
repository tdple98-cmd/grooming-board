import { computeTodayStats, computeDueToRebookCount, computeSquareRevenue, formatDigestText } from "./ownerStats.js";

/** Shared by the manual "text me this" button and the nightly cron so both produce identical text. */
export async function buildAndDeliverDigest(supabase, dateStr, { sendSms }) {
  const squareAccessToken = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const squareEnvironment = process.env.SQUARE_ENVIRONMENT || "sandbox";

  const [today, dueToRebookCount, squareRevenue] = await Promise.all([
    computeTodayStats(supabase, dateStr),
    computeDueToRebookCount(supabase, dateStr),
    squareAccessToken
      ? computeSquareRevenue({ environment: squareEnvironment, accessToken: squareAccessToken }, dateStr)
      : { ok: false, error: "Square not configured" },
  ]);
  const stats = { date: dateStr, today, dueToRebookCount, squareRevenue };
  const text = formatDigestText(stats);

  let smsSent = false;
  if (sendSms) {
    const replyEngineUrl = (process.env.REPLY_ENGINE_URL || "").trim();
    const boardApiSecret = (process.env.BOARD_API_SECRET || "").trim();
    if (replyEngineUrl && boardApiSecret) {
      try {
        const res = await fetch(`${replyEngineUrl.replace(/\/$/, "")}/api/board/owner-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Board-Secret": boardApiSecret },
          body: JSON.stringify({ body: text }),
        });
        smsSent = res.ok;
      } catch (err) {
        console.error("Digest SMS send failed:", err);
      }
    }
  }

  await supabase
    .from("daily_digests")
    .upsert({ date: dateStr, digest_text: text, stats, sent_sms: smsSent }, { onConflict: "date" });

  return { text, stats, smsSent };
}
