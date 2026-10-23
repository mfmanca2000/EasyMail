import { authed } from "@/lib/api";
import { sendDigest } from "@/lib/digest";

export const maxDuration = 60;

export const POST = authed(async () => sendDigest());
