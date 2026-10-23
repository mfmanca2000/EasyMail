import { z } from "zod";
import { authed } from "@/lib/api";
import { purgeNotImportant } from "@/lib/mail";

export const maxDuration = 60;

const body = z.object({ permanent: z.boolean().default(false) });

export const POST = authed(async (req) => {
  const { permanent } = body.parse(await req.json().catch(() => ({})));
  return purgeNotImportant(permanent);
});
