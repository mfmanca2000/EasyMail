import { db, exec, kvGet, kvSet, query } from "./db";
import { MIN_EXAMPLES, type Label } from "./classifier";
import {
  deleteMessages,
  ensureFolder,
  listAllFolders,
  listMessages,
  moveMessages,
  wellKnownFolderIds,
} from "./graph";
import { adjust, predictMany } from "./model";
import { getSettings, type Settings } from "./settings";

export type FolderKind = "inbox" | "junk" | "important" | "not_important" | "other";
export type LabelSource = "user" | "folder" | "auto";

export type MessageRow = {
  id: string;
  folder_id: string;
  folder_kind: FolderKind;
  was_junk: number;
  subject: string;
  sender: string;
  sender_name: string;
  preview: string;
  received_at: string;
  first_seen_at: string;
  is_read: number;
  web_link: string | null;
  label: Label | null;
  label_source: LabelSource | null;
  trained_label: Label | null;
  score: number | null;
  digested: number;
};

export type Folders = { important: string; notImportant: string; inbox: string; junk: string };

export async function getFolders(): Promise<Folders | null> {
  const raw = await kvGet("folders");
  return raw ? (JSON.parse(raw) as Folders) : null;
}

const like = (r: MessageRow) => ({
  sender: r.sender,
  subject: r.subject,
  preview: r.preview,
  wasJunk: !!r.was_junk || r.folder_kind === "junk",
});

/** Label that would be applied to this message, and where it came from. */
export function effectiveLabel(r: MessageRow, threshold: number): Label | null {
  if (r.label) return r.label;
  if (r.score == null) return null;
  const confidence = Math.max(r.score, 1 - r.score);
  if (confidence < threshold) return null;
  return r.score >= 0.5 ? "important" : "not_important";
}

export type SyncResult = { scanned: number; trained: number; moved: number; failedMoves: number };

/** Read all folders, learn from the user's labels, score the rest, optionally move mail. */
export async function sync(opts: { organize?: boolean } = {}): Promise<SyncResult> {
  const settings = await getSettings();
  const all = await listAllFolders();
  const wk = await wellKnownFolderIds();
  const importantId = await ensureFolder(settings.importantFolder, all);
  const notImportantId = await ensureFolder(settings.notImportantFolder, all);
  const folders: Folders = {
    important: importantId,
    notImportant: notImportantId,
    inbox: wk.inbox,
    junk: wk.junkemail,
  };
  await kvSet("folders", JSON.stringify(folders));

  const skip = new Set([wk.sentitems, wk.drafts, wk.deleteditems, wk.outbox]);
  const scan = new Map<string, FolderKind>();
  for (const f of all) {
    if (skip.has(f.id)) continue;
    scan.set(f.id, f.id === importantId ? "important" : f.id === notImportantId ? "not_important" : f.id === wk.junkemail ? "junk" : f.id === wk.inbox ? "inbox" : "other");
  }
  for (const id of [importantId, notImportantId]) {
    if (!scan.has(id)) scan.set(id, id === importantId ? "important" : "not_important");
  }

  const existing = new Map((await query<MessageRow>("SELECT * FROM messages")).map((r) => [r.id, r]));
  const now = new Date().toISOString();
  const c = await db();
  const stmts: { sql: string; args: (string | number | null)[] }[] = [];
  const seen = new Set<string>();

  for (const [folderId, kind] of scan) {
    const msgs = await listMessages(folderId, settings.syncDepth);
    for (const m of msgs) {
      seen.add(m.id);
      const prev = existing.get(m.id);
      const sender = (m.from?.emailAddress.address ?? "").toLowerCase();
      let label = prev?.label ?? null;
      let source = prev?.label_source ?? null;
      // A message that appears in one of our folders without us having put it there was moved by the user: learn from it.
      if ((kind === "important" || kind === "not_important") && (!prev || prev.folder_kind !== kind)) {
        label = kind;
        source = "folder";
      }
      stmts.push({
        sql: `INSERT INTO messages(id, folder_id, folder_kind, was_junk, subject, sender, sender_name, preview, received_at, first_seen_at, is_read, web_link, label, label_source)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET folder_id=excluded.folder_id, folder_kind=excluded.folder_kind,
                was_junk=MAX(was_junk, excluded.was_junk), is_read=excluded.is_read,
                label=excluded.label, label_source=excluded.label_source`,
        args: [
          m.id, folderId, kind, kind === "junk" ? 1 : 0, m.subject ?? "", sender,
          m.from?.emailAddress.name ?? "", (m.bodyPreview ?? "").slice(0, 300), m.receivedDateTime,
          prev?.first_seen_at ?? now, m.isRead ? 1 : 0, m.webLink ?? null, label, source,
        ],
      });
    }
  }
  // Forget messages that left the folders we watch (deleted, sent, archived elsewhere).
  for (const id of existing.keys()) if (!seen.has(id)) stmts.push({ sql: "DELETE FROM messages WHERE id = ?", args: [id] });
  for (let i = 0; i < stmts.length; i += 200) await c.batch(stmts.slice(i, i + 200), "write");

  const trained = await learn();
  await rescore();
  const moveResult = opts.organize ? await organize(settings) : { moved: 0, failed: 0 };
  return { scanned: seen.size, trained, moved: moveResult.moved, failedMoves: moveResult.failed };
}

/** Bring the feature counts in line with confirmed labels (user choice or folder placement). */
async function learn(): Promise<number> {
  const rows = await query<MessageRow>(
    `SELECT * FROM messages WHERE label_source IN ('user','folder') AND (trained_label IS NULL OR trained_label != label)`,
  );
  for (const r of rows) {
    if (r.trained_label) await adjust(like(r), r.trained_label, -1);
    await adjust(like(r), r.label!, 1);
    await exec("UPDATE messages SET trained_label = ? WHERE id = ?", [r.label, r.id]);
  }
  return rows.length;
}

async function rescore(): Promise<void> {
  const rows = await query<MessageRow>("SELECT * FROM messages WHERE label_source IS NULL OR label_source = 'auto'");
  if (!rows.length) return;
  const preds = await predictMany(rows.map(like));
  const c = await db();
  await c.batch(
    rows.map((r, i) => ({ sql: "UPDATE messages SET score = ? WHERE id = ?", args: [preds[i].score, r.id] })),
    "write",
  );
}

export type Plan = { id: string; to: Label }[];

/** Messages that are not in the folder their label says they belong in. */
export async function planMoves(settings: Settings): Promise<Plan> {
  const rows = await query<MessageRow>("SELECT * FROM messages");
  const plan: Plan = [];
  for (const r of rows) {
    // Only reshuffle mail in inbox/junk or in our folders; mail in other folders moves only on an explicit user label
    // unless the user opted in to moving predicted mail out of custom folders.
    const free = r.folder_kind !== "other" || r.label_source === "user" || settings.moveFromCustomFolders;
    if (!free) continue;
    const to = effectiveLabel(r, settings.confidenceThreshold);
    if (!to) continue;
    if (r.folder_kind === to) continue;
    plan.push({ id: r.id, to });
  }
  return plan;
}

export async function organize(settings?: Settings): Promise<{ moved: number; failed: number }> {
  const s = settings ?? (await getSettings());
  const folders = await getFolders();
  if (!folders) throw new Error("Run a sync first.");
  const plan = await planMoves(s);
  let moved = 0;
  let failed = 0;
  for (const to of ["important", "not_important"] as const) {
    const batch = plan.filter((p) => p.to === to);
    if (!batch.length) continue;
    const dest = to === "important" ? folders.important : folders.notImportant;
    const res = await moveMessages(batch.map((p) => p.id), dest);
    failed += res.failed.length;
    const c = await db();
    await c.batch(
      batch
        .filter((p) => res.moved.has(p.id))
        .map((p) => ({
          // Graph gives a moved message a new id; follow it. Predicted moves are stored as 'auto' so they are not learned as if confirmed.
          sql: `UPDATE messages SET id = ?, folder_id = ?, folder_kind = ?,
                  label = COALESCE(label, ?), label_source = COALESCE(label_source, 'auto')
                WHERE id = ?`,
          args: [res.moved.get(p.id)!, dest, to, to, p.id],
        })),
      "write",
    );
    moved += res.moved.size;
  }
  return { moved, failed };
}

export async function setLabel(ids: string[], label: Label | "clear"): Promise<void> {
  const c = await db();
  await c.batch(
    ids.map((id) =>
      label === "clear"
        ? { sql: "UPDATE messages SET label = NULL, label_source = NULL WHERE id = ?", args: [id] }
        : { sql: "UPDATE messages SET label = ?, label_source = 'user' WHERE id = ?", args: [label, id] },
    ),
    "write",
  );
  await learn();
  await rescore();
}

/** Delete everything in the Not Important and Junk folders (as it is on the server right now). */
export async function purgeNotImportant(permanent: boolean): Promise<{ deleted: number; failed: number }> {
  const folders = await getFolders();
  if (!folders) throw new Error("Run a sync first.");
  let deleted = 0;
  let failed = 0;
  for (const folderId of [folders.notImportant, folders.junk]) {
    const msgs = await listMessages(folderId, 50_000);
    const f = await deleteMessages(msgs.map((m) => m.id), permanent);
    failed += f;
    deleted += msgs.length - f;
  }
  await exec("DELETE FROM messages WHERE folder_kind IN ('not_important','junk')");
  return { deleted, failed };
}

export type Stats = {
  important: number;
  notImportant: number;
  junk: number;
  review: number;
  labelled: number;
  ready: boolean;
};

export async function stats(): Promise<Stats> {
  const rows = await query<{ k: string; n: number }>(
    `SELECT CASE WHEN folder_kind='junk' THEN 'junk' WHEN folder_kind='important' THEN 'important' WHEN folder_kind='not_important' THEN 'notImportant' ELSE 'other' END AS k, COUNT(*) AS n
     FROM messages GROUP BY k`,
  );
  const n = (k: string) => Number(rows.find((r) => r.k === k)?.n ?? 0);
  const review = await query<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE label_source IS NULL OR label_source = 'auto'");
  const labelled = await query<{ n: number }>("SELECT important + not_important AS n FROM features WHERE feature = '__docs__'");
  const total = Number(labelled[0]?.n ?? 0);
  return {
    important: n("important"),
    notImportant: n("notImportant"),
    junk: n("junk"),
    review: Number(review[0]?.n ?? 0),
    labelled: total,
    ready: total >= MIN_EXAMPLES,
  };
}
