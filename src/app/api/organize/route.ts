import { authed } from "@/lib/api";
import { organize } from "@/lib/mail";

export const maxDuration = 60;

export const POST = authed(async () => organize());
