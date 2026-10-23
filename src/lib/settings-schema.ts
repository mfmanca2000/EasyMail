import { z } from "zod";

export const settingsSchema = z.object({
  /** Hour of day (0-23, in `timezone`) when the daily digest is sent. */
  digestHour: z.number().int().min(0).max(23),
  digestEnabled: z.boolean(),
  timezone: z.string().min(1),
  /** Move mail into the two folders automatically on every sync. */
  autoOrganize: z.boolean(),
  /** Model must be at least this sure (0.5-0.99) before a prediction is acted on automatically. */
  confidenceThreshold: z.number().min(0.5).max(0.99),
  importantFolder: z.string().min(1).max(50),
  notImportantFolder: z.string().min(1).max(50),
  /** How many recent messages to read per folder on each sync. */
  syncDepth: z.number().int().min(25).max(1000),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  digestHour: 8,
  digestEnabled: true,
  timezone: "Europe/Rome",
  autoOrganize: false,
  confidenceThreshold: 0.85,
  importantFolder: "Important",
  notImportantFolder: "Not Important",
  syncDepth: 200,
};
