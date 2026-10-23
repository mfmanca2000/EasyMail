import { db, query } from "./db";
import { DOCS_KEY, extractFeatures, predict, type Counts, type Label, type MessageLike, type Prediction } from "./classifier";

type Row = { feature: string; important: number; not_important: number };

/** Adjust the feature counts for one message: `delta` = +1 to learn it, -1 to unlearn it. */
export async function adjust(m: MessageLike, label: Label, delta: 1 | -1): Promise<void> {
  const c = await db();
  const features = [DOCS_KEY, ...extractFeatures(m).keys()];
  const col = label === "important" ? "important" : "not_important";
  await c.batch(
    features.map((feature) => ({
      sql: `INSERT INTO features(feature, ${col}) VALUES(?, MAX(0, ?))
            ON CONFLICT(feature) DO UPDATE SET ${col} = MAX(0, ${col} + ?)`,
      args: [feature, delta, delta],
    })),
    "write",
  );
}

/** Load counts for every feature the given messages touch, in one pass. */
export async function loadLookup(messages: MessageLike[]): Promise<Map<string, Counts>> {
  const wanted = new Set<string>([DOCS_KEY]);
  for (const m of messages) for (const k of extractFeatures(m).keys()) wanted.add(k);
  const list = [...wanted];
  const lookup = new Map<string, Counts>();
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    const rows = await query<Row>(
      `SELECT feature, important, not_important FROM features WHERE feature IN (${chunk.map(() => "?").join(",")})`,
      chunk,
    );
    for (const r of rows) lookup.set(r.feature, { important: Number(r.important), not_important: Number(r.not_important) });
  }
  return lookup;
}

export async function predictMany(messages: MessageLike[]): Promise<Prediction[]> {
  const lookup = await loadLookup(messages);
  return messages.map((m) => predict(m, lookup));
}
