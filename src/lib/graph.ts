import { z } from "zod";
import { accessToken } from "./msauth";

const BASE = "https://graph.microsoft.com/v1.0";

async function graph<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const wait = Number(res.headers.get("Retry-After") ?? 2 ** attempt);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Graph ${init.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
    const text = await res.text(); // 202/204 (e.g. sendMail) come back empty
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

/** Parse a Graph response, naming the call and the offending fields if it doesn't match (not a user-input error). */
function parseGraph<S extends z.ZodType>(schema: S, data: unknown, what: string): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const detail = r.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  throw new Error(`Unexpected Graph response for ${what} - ${detail}`);
}

const folderSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  childFolderCount: z.number().optional(),
});
export type MailFolder = z.infer<typeof folderSchema>;

const messageSchema = z.object({
  id: z.string(),
  subject: z.string().nullish(),
  bodyPreview: z.string().nullish(),
  receivedDateTime: z.string(),
  isRead: z.boolean().optional(),
  webLink: z.string().nullish(),
  from: z
    .object({ emailAddress: z.object({ name: z.string().nullish(), address: z.string().nullish() }) })
    .nullish(),
});
export type GraphMessage = z.infer<typeof messageSchema>;

const page = <T extends z.ZodType>(item: T) =>
  z.object({ value: z.array(item), "@odata.nextLink": z.string().optional() });

/** Ids of the well-known folders we must never treat as mailboxes to organise. */
export async function wellKnownFolderIds() {
  const names = ["inbox", "junkemail", "sentitems", "drafts", "deleteditems", "outbox"] as const;
  const entries = await Promise.all(
    names.map(async (n) => [n, parseGraph(folderSchema, await graph(`/me/mailFolders/${n}?$select=id,displayName`), `folder ${n}`).id] as const),
  );
  return Object.fromEntries(entries) as Record<(typeof names)[number], string>;
}

/** All folders (recursively) as a flat list. */
export async function listAllFolders(): Promise<MailFolder[]> {
  const out: MailFolder[] = [];
  const walk = async (path: string) => {
    let next: string | undefined = `${path}?$top=100&$select=id,displayName,childFolderCount`;
    while (next) {
      const p: z.infer<ReturnType<typeof page<typeof folderSchema>>> = parseGraph(page(folderSchema), await graph(next), "folder list");
      for (const f of p.value) {
        out.push(f);
        if (f.childFolderCount) await walk(`/me/mailFolders/${f.id}/childFolders`);
      }
      next = p["@odata.nextLink"];
    }
  };
  await walk("/me/mailFolders");
  return out;
}

export async function ensureFolder(name: string, existing: MailFolder[]): Promise<string> {
  const found = existing.find((f) => f.displayName.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const created = parseGraph(
    folderSchema,
    await graph("/me/mailFolders", { method: "POST", body: JSON.stringify({ displayName: name }) }),
    `create folder ${name}`,
  );
  return created.id;
}

/** Most recent `limit` messages of a folder (newest first). */
export async function listMessages(folderId: string, limit: number): Promise<GraphMessage[]> {
  const out: GraphMessage[] = [];
  let next: string | undefined =
    `/me/mailFolders/${folderId}/messages?$top=${Math.min(limit, 100)}` +
    `&$select=id,subject,bodyPreview,receivedDateTime,isRead,webLink,from&$orderby=receivedDateTime desc`;
  while (next && out.length < limit) {
    const p: z.infer<ReturnType<typeof page<typeof messageSchema>>> = parseGraph(page(messageSchema), await graph(next), "message list");
    out.push(...p.value);
    next = p["@odata.nextLink"];
  }
  return out.slice(0, limit);
}

const batchSchema = z.object({
  responses: z.array(z.object({ id: z.string(), status: z.number(), body: z.unknown().optional() })),
});

async function batched(requests: { method: string; url: string; body?: unknown }[]) {
  const failures: string[] = [];
  for (let i = 0; i < requests.length; i += 20) {
    const chunk = requests.slice(i, i + 20).map((r, j) => ({
      id: String(j),
      method: r.method,
      url: r.url,
      ...(r.body ? { body: r.body, headers: { "Content-Type": "application/json" } } : {}),
    }));
    const res = parseGraph(
      batchSchema,
      await graph("/$batch", { method: "POST", body: JSON.stringify({ requests: chunk }) }),
      "batch",
    );
    for (const r of res.responses) if (r.status >= 300) failures.push(`${chunk[Number(r.id)].url} -> ${r.status}`);
  }
  return failures;
}

/**
 * Move messages to `destinationId`. Graph assigns a new id to a moved message,
 * so this returns old id -> new id for the ones that succeeded, plus the failed ids.
 */
export async function moveMessages(
  ids: string[],
  destinationId: string,
): Promise<{ moved: Map<string, string>; failed: string[] }> {
  const moved = new Map<string, string>();
  const failed: string[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const res = batchSchema.parse(
      await graph("/$batch", {
        method: "POST",
        body: JSON.stringify({
          requests: chunk.map((id, j) => ({
            id: String(j),
            method: "POST",
            url: `/me/messages/${id}/move`,
            headers: { "Content-Type": "application/json" },
            body: { destinationId },
          })),
        }),
      }),
    );
    for (const r of res.responses) {
      const oldId = chunk[Number(r.id)];
      const newId = z.object({ id: z.string() }).safeParse(r.body);
      if (r.status < 300 && newId.success) moved.set(oldId, newId.data.id);
      else failed.push(oldId);
    }
  }
  return { moved, failed };
}

/** Delete messages. `permanent` skips the Deleted Items folder. Returns the number of failures. */
export async function deleteMessages(ids: string[], permanent: boolean): Promise<number> {
  const failures = await batched(
    ids.map((id) =>
      permanent
        ? { method: "POST", url: `/me/messages/${id}/permanentDelete` }
        : { method: "DELETE", url: `/me/messages/${id}` },
    ),
  );
  return failures.length;
}

export async function sendMailToSelf(to: string, subject: string, html: string) {
  await graph("/me/sendMail", {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: false,
    }),
  });
}

export async function findInFolderBySubject(folderId: string, subject: string): Promise<string | null> {
  const p = page(z.object({ id: z.string(), subject: z.string().nullish() })).parse(
    await graph(`/me/mailFolders/${folderId}/messages?$top=10&$select=id,subject&$orderby=receivedDateTime desc`),
  );
  return p.value.find((m) => m.subject === subject)?.id ?? null;
}

export async function me(accessTokenOverride?: string): Promise<{ mail: string }> {
  const res = await fetch(`${BASE}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessTokenOverride ?? (await accessToken())}` },
  });
  if (!res.ok) throw new Error(`Graph /me -> ${res.status}`);
  const j = z.object({ mail: z.string().nullish(), userPrincipalName: z.string() }).parse(await res.json());
  return { mail: (j.mail ?? j.userPrincipalName).toLowerCase() };
}
