import { z } from "zod";
import { authed } from "@/lib/api";
import { markRead } from "@/lib/mail";

const body = z.object({ id: z.string() });

export const POST = authed(async (req) => {
  const { id } = body.parse(await req.json());
  await markRead(id);
  return { ok: true };
});
