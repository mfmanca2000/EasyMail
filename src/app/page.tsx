import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { ActionsBar } from "@/components/actions-bar";
import { MessageTable, type MessageItem } from "@/components/message-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { kvGet, query } from "@/lib/db";
import { MIN_EXAMPLES } from "@/lib/classifier";
import { stats, type MessageRow } from "@/lib/mail";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  // The session cookie outlives the stored Microsoft refresh token (e.g. after a database change): sign in again.
  if (!(await kvGet("ms_refresh_token"))) {
    redirect(`/login?error=${encodeURIComponent("Not connected to Microsoft. Please sign in again.")}`);
  }
  const [rows, s, settings] = await Promise.all([
    query<MessageRow>("SELECT * FROM messages ORDER BY received_at DESC LIMIT 1500"),
    stats(),
    getSettings(),
  ]);

  const items = rows.map((r) => ({
    confirmed: r.label_source === "user" || r.label_source === "folder",
    item: {
      id: r.id,
      sender: r.sender,
      senderName: r.sender_name,
      subject: r.subject,
      preview: r.preview,
      receivedAt: r.received_at,
      isJunk: r.folder_kind === "junk" || !!r.was_junk,
      isRead: !!r.is_read,
      webLink: r.web_link,
      label: r.label_source === "user" || r.label_source === "folder" ? r.label : null,
      score: r.score,
    } satisfies MessageItem,
    label: r.label,
  }));

  const review = items.filter((i) => !i.confirmed).map((i) => i.item);
  const important = items.filter((i) => i.confirmed && i.label === "important").map((i) => i.item);
  const notImportant = items.filter((i) => i.confirmed && i.label === "not_important").map((i) => i.item);

  const stat = (label: string, value: number, hint?: string) => (
    <Card>
      <CardHeader className="p-4 pb-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="p-4 pt-0 text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Important", s.important)}
        {stat("Not important", s.notImportant)}
        {stat("Junk", s.junk)}
        {stat("To review", s.review)}
      </div>

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

      <ActionsBar deletable={s.notImportant + s.junk} />

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">To review ({review.length})</TabsTrigger>
          <TabsTrigger value="important">Important ({important.length})</TabsTrigger>
          <TabsTrigger value="not_important">Not important ({notImportant.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="pt-3">
          <MessageTable items={review} timeZone={settings.timezone} emptyText="Nothing to review." />
        </TabsContent>
        <TabsContent value="important" className="pt-3">
          <MessageTable items={important} timeZone={settings.timezone} emptyText="No important mail yet." />
        </TabsContent>
        <TabsContent value="not_important" className="pt-3">
          <MessageTable items={notImportant} timeZone={settings.timezone} emptyText="No mail set aside yet." />
        </TabsContent>
      </Tabs>
    </main>
  );
}
