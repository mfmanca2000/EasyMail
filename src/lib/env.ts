import { z } from "zod";

const schema = z.object({
  MS_CLIENT_ID: z.string().min(1),
  MS_CLIENT_SECRET: z.string().min(1),
  /** Public base URL of the app, e.g. https://easymail.vercel.app (no trailing slash). */
  APP_URL: z.string().url(),
  /** The only mailbox allowed to sign in, e.g. you@hotmail.com. */
  ALLOWED_EMAIL: z.string().email(),
  SESSION_SECRET: z.string().min(32),
  /** Bearer token the scheduler uses to call /api/cron/*. */
  CRON_SECRET: z.string().min(16),
  /** Explicit database, wins over everything below. Use these on Vercel when an integration injects its own TURSO_* values. */
  EASYMAIL_DATABASE_URL: z.string().optional(),
  EASYMAIL_DATABASE_AUTH_TOKEN: z.string().optional(),
  /** Turso (libSQL) URL; falls back to DATABASE_URL, then a local SQLite file. */
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  /** Optional: enables LLM-written digest summaries. Without it the digest is a plain grouped list. */
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid or missing environment variables: ${missing}`);
    }
    cached = parsed.data;
  }
  return cached;
}
