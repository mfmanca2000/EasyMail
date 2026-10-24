import { createClient, type Client, type InValue } from "@libsql/client";
import { env } from "./env";

let client: Client | undefined;
let ready: Promise<void> | undefined;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    folder_kind TEXT NOT NULL,            -- inbox | junk | important | not_important | other
    was_junk INTEGER NOT NULL DEFAULT 0,  -- ever seen in the junk folder
    subject TEXT NOT NULL DEFAULT '',
    sender TEXT NOT NULL DEFAULT '',
    sender_name TEXT NOT NULL DEFAULT '',
    preview TEXT NOT NULL DEFAULT '',
    received_at TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    web_link TEXT,
    label TEXT,                           -- important | not_important | NULL (decided by user or by folder)
    label_source TEXT,                    -- user | folder
    trained_label TEXT,                   -- label currently reflected in the feature counts
    score REAL,                           -- model P(important), NULL while the model is cold
    digested INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS messages_received ON messages(received_at DESC)`,
  `CREATE TABLE IF NOT EXISTS features (
    feature TEXT PRIMARY KEY,
    important INTEGER NOT NULL DEFAULT 0,
    not_important INTEGER NOT NULL DEFAULT 0
  )`,
];

/** The database in use and the variable it came from; the auth token always comes from the matching variable. */
function databaseConfig(): { url: string; authToken?: string; source: string } {
  const e = env();
  if (e.EASYMAIL_DATABASE_URL) return { url: e.EASYMAIL_DATABASE_URL, authToken: e.EASYMAIL_DATABASE_AUTH_TOKEN, source: "EASYMAIL_DATABASE_URL" };
  if (e.TURSO_DATABASE_URL) return { url: e.TURSO_DATABASE_URL, authToken: e.TURSO_AUTH_TOKEN ?? e.DATABASE_AUTH_TOKEN, source: "TURSO_DATABASE_URL" };
  if (e.DATABASE_URL) return { url: e.DATABASE_URL, authToken: e.DATABASE_AUTH_TOKEN ?? e.TURSO_AUTH_TOKEN, source: "DATABASE_URL" };
  return { url: "file:easymail.db", source: "default" };
}

const databaseUrl = () => databaseConfig().url;

/** True in a production build when the database is a local file: on serverless hosts such as Vercel it is wiped on every deploy. */
export function databaseIsEphemeral(): boolean {
  return (!!process.env.VERCEL || process.env.NODE_ENV === "production") && databaseUrl().startsWith("file:");
}

/** Where data is stored, for the diagnostics line. Never includes the auth token or URL path/query. */
export function databaseLabel(): string {
  const { url, source } = databaseConfig();
  if (url.startsWith("file:")) return `${url} (${source})`;
  try {
    return `${new URL(url).host} (${source})`;
  } catch {
    return `unrecognised URL (${source})`;
  }
}

export async function db(): Promise<Client> {
  if (!client) {
    const { url, authToken } = databaseConfig();
    client = createClient({ url, authToken });
  }
  if (!ready) {
    const c = client;
    ready = c.batch(SCHEMA, "write").then(() => undefined);
  }
  await ready;
  return client;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  args: InValue[] = [],
): Promise<T[]> {
  const c = await db();
  const res = await c.execute({ sql, args });
  return res.rows as unknown as T[];
}

export async function exec(sql: string, args: InValue[] = []): Promise<void> {
  const c = await db();
  await c.execute({ sql, args });
}

export async function kvGet(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>("SELECT value FROM kv WHERE key = ?", [key]);
  return rows[0]?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  await exec(
    "INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}
