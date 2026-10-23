import { z } from "zod";
import { authed } from "@/lib/api";
import { setLabel } from "@/lib/mail";

const body = z.object({
  ids: z.array(z.string()).min(1).max(500),
  label: z.enum(["important", "not_important", "clear"]),
});

export const POST = authed(async (req) => {
  const { ids, label } = body.parse(await req.json());
  await setLabel(ids, label);
  return { ok: true };
});
