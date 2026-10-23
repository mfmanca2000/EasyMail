import { cron } from "@/lib/api";
import { sendDigestIfDue } from "@/lib/digest";
import { sync } from "@/lib/mail";
import { getSettings } from "@/lib/settings";

export const maxDuration = 60;

// Meant to be called hourly: syncs (and files mail if auto-organise is on), then sends the daily digest once it is due.
export const GET = cron(async () => {
  const s = await getSettings();
  const synced = await sync({ organize: s.autoOrganize });
  const digest = await sendDigestIfDue();
  return { synced, digest };
});
