import { authed } from "@/lib/api";
import { sync } from "@/lib/mail";
import { getSettings } from "@/lib/settings";

export const maxDuration = 60;

export const POST = authed(async () => sync({ organize: (await getSettings()).autoOrganize }));
