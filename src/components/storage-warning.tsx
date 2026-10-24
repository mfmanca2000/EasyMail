import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { databaseIsEphemeral } from "@/lib/db";

/** Shown (home and login) when the database is a local file on Vercel, which is wiped on every deploy. */
export function StorageWarning() {
  if (!databaseIsEphemeral()) return null;
  return (
    <Card className="border-destructive">
      <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
        <Badge variant="warning">Database not persistent</Badge>
        The database URL is a local file (<code>file:</code>), which serverless hosts such as Vercel erase on every deploy. You will be signed out and lose
        all labels and counters each time. Set <code>TURSO_DATABASE_URL</code> to a <code>libsql://…</code> URL (and{" "}
        <code>TURSO_AUTH_TOKEN</code>) for the Production environment, then redeploy.
      </CardContent>
    </Card>
  );
}
