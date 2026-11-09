import { cron } from "@/lib/api";
import { sendDigestIfDue } from "@/lib/digest";
import { sync } from "@/lib/mail";
import { kvGet, kvSet } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const maxDuration = 60;

// Meant to be called hourly: syncs (and files mail if auto-organise is on), then sends the daily digest once it is due.
const MIN_GAP_MS = 55 * 60_000;

const handler = cron(async () => {
  // Uptime monitors may ping far more often than hourly; a full sync each time burns the CPU quota for nothing.
  const last = Number(await kvGet("last_cron_run")) || 0;
  if (Date.now() - last < MIN_GAP_MS) return { skipped: "ran recently" };
  await kvSet("last_cron_run", String(Date.now()));
  const s = await getSettings();
  const synced = await sync({ organize: s.autoOrganize });
  const digest = await sendDigestIfDue();
  return { synced, digest };
});

export const GET = handler;
// Uptime monitors (e.g. UptimeRobot) often ping with HEAD; run the job the same way.
export const HEAD = handler;
