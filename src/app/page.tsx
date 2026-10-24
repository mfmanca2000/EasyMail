import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { ActionsBar } from "@/components/actions-bar";
import { StorageWarning } from "@/components/storage-warning";
import { MailBoard, type BoardItem } from "@/components/mail-board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { kvGet, query } from "@/lib/db";
import { MIN_EXAMPLES } from "@/lib/classifier";
import { planMoves, stats, type MessageRow } from "@/lib/mail";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  // The session cookie outlives the stored Microsoft refresh token (e.g. after a database change): sign in again.
  if (!(await kvGet("ms_refresh_token"))) {
    redirect(`/login?error=${encodeURIComponent("Not connected to Microsoft. Please sign in again.")}`);
  }
  const settings = await getSettings();
  const [rows, s] = await Promise.all([
    query<MessageRow>("SELECT * FROM messages ORDER BY received_at DESC LIMIT 1500"),
    stats(settings),
  ]);

  const plan = new Map((await planMoves(settings)).map((p) => [p.id, p.to]));
  const items: BoardItem[] = rows.map((r) => {
    const confirmed = r.label_source === "user" || r.label_source === "folder";
    return {
      id: r.id,
      sender: r.sender,
      senderName: r.sender_name,
      subject: r.subject,
      preview: r.preview,
      receivedAt: r.received_at,
      isJunk: r.folder_kind === "junk" || !!r.was_junk,
      isRead: !!r.is_read,
      webLink: r.web_link,
      label: confirmed ? r.label : null,
      score: r.score,
      planned: plan.get(r.id) ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <StorageWarning />
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">EasyMail</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" title="Settings">
            <Link href="/settings"><SettingsIcon /></Link>
          </Button>
          <form action="/api/auth/logout" method="post">
            <Button variant="outline" size="sm">Sign out</Button>
          </form>
        </div>
      </header>

      {!s.ready && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
            <Badge variant="warning">Learning</Badge>
            {rows.length === 0
              ? "Press Sync to read your mailbox, then mark a few messages as important or not important."
              : `I have ${s.labelled} of the ${MIN_EXAMPLES} labelled examples needed before I start suggesting. Mark messages below (or just drag a few into your Important / Not Important folders).`}
          </CardContent>
        </Card>
      )}

      <ActionsBar deletable={s.inNotImportantFolder + s.junk} />

      <MailBoard items={items} stats={s} timeZone={settings.timezone} />
    </main>
  );
}
