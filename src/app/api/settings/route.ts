import { authed } from "@/lib/api";
import { getSettings, saveSettings } from "@/lib/settings";

export const GET = authed(async () => getSettings());
export const PUT = authed(async (req) => saveSettings(await req.json()));
