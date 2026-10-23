import { kvGet, kvSet } from "./db";
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from "./settings-schema";

export { settingsSchema, DEFAULT_SETTINGS, type Settings };

export async function getSettings(): Promise<Settings> {
  const raw = await kvGet("settings");
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return settingsSchema.parse({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(input: unknown): Promise<Settings> {
  const next = settingsSchema.parse(input);
  await kvSet("settings", JSON.stringify(next));
  return next;
}
