import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser } from "./session";
import { env } from "./env";

type Handler = (req: Request) => Promise<Response | object>;

/** Wrap a route handler: require a signed-in user, turn thrown errors into JSON. */
export function authed(handler: Handler) {
  return async (req: Request) => {
    if (!(await currentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return run(handler, req);
  };
}

/** Same, but for the scheduler: requires `Authorization: Bearer $CRON_SECRET`. */
export function cron(handler: Handler) {
  return async (req: Request) => {
    if (req.headers.get("authorization") !== `Bearer ${env().CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return run(handler, req);
  };
}

async function run(handler: Handler, req: Request) {
  try {
    const out = await handler(req);
    return out instanceof Response ? out : NextResponse.json(out);
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "Invalid input", issues: e.issues }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
