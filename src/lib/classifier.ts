/**
 * Small online Naive-Bayes-style classifier over sender / subject / preview features.
 * Pure functions only: counts are loaded and persisted by model.ts.
 */

export type Label = "important" | "not_important";

export type MessageLike = {
  sender: string;
  subject: string;
  preview: string;
  wasJunk: boolean;
};

export type Counts = { important: number; not_important: number };

/** Number of labelled examples below which we refuse to guess. */
export const MIN_EXAMPLES = 10;
export const DOCS_KEY = "__docs__";

const STOP = new Set(
  "the a an and or of to in on for with from is are be this that it as at by you your we our not no yes re fw fwd il lo la le gli di da e che un una per con del della dei the".split(" "),
);

function tokens(text: string, max: number): string[] {
  const out = new Set<string>();
  for (const t of text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/)) {
    if (t.length >= 3 && t.length <= 20 && !STOP.has(t) && !/^\d+$/.test(t)) out.add(t);
    if (out.size >= max) break;
  }
  return [...out];
}

/** Features with their weights. Sender identity is far more telling than any word. */
export function extractFeatures(m: MessageLike): Map<string, number> {
  const f = new Map<string, number>();
  const addr = m.sender.toLowerCase();
  if (addr) {
    f.set(`from:${addr}`, 1);
    const domain = addr.split("@")[1];
    if (domain) f.set(`dom:${domain}`, 0.7);
  }
  for (const t of tokens(m.subject, 15)) f.set(`s:${t}`, 0.35);
  for (const t of tokens(m.preview.slice(0, 250), 25)) f.set(`p:${t}`, 0.15);
  if (m.wasJunk) f.set("junk", 1);
  return f;
}

export type Prediction = { score: number | null; label: Label | null; confidence: number };

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * @param lookup counts per feature (must include DOCS_KEY with the number of labelled messages per class)
 */
export function predict(m: MessageLike, lookup: Map<string, Counts>): Prediction {
  if (m.subject.startsWith("[EasyMail]")) return { score: 1, label: "important", confidence: 1 };

  const docs = lookup.get(DOCS_KEY) ?? { important: 0, not_important: 0 };
  const n = docs.important + docs.not_important;
  if (n < MIN_EXAMPLES || docs.important < 2 || docs.not_important < 2) {
    return { score: null, label: null, confidence: 0 };
  }

  const a = 1;
  let logit = Math.log((docs.important + a) / (docs.not_important + a));
  for (const [feature, weight] of extractFeatures(m)) {
    const c = lookup.get(feature);
    if (!c || c.important + c.not_important === 0) continue; // unseen: no evidence either way
    const pi = (c.important + a) / (docs.important + 2 * a);
    const pn = (c.not_important + a) / (docs.not_important + 2 * a);
    logit += weight * Math.log(pi / pn);
  }
  logit = Math.max(-12, Math.min(12, logit));
  const score = sigmoid(logit);
  const label: Label = score >= 0.5 ? "important" : "not_important";
  return { score, label, confidence: Math.max(score, 1 - score) };
}
