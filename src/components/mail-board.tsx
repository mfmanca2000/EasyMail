"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageTable, type MessageItem } from "@/components/message-table";
import { api } from "@/lib/client";

type Label = "important" | "not_important";

export type BoardItem = MessageItem & {
  /** Folder the model/label would currently move this message to on the next "File mail", if it is not there already. */
  planned: Label | null;
};

export type BoardStats = {
  important: number;
  notImportant: number;
  review: number;
  junk: number;
  pendingImportant: number;
  pendingNotImportant: number;
};

type Bucket = "review" | Label;
const bucketOf = (i: BoardItem): Bucket => i.label ?? "review";

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="p-4 pt-0 text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

/**
 * Cards, tab counts and lists all come from the same label-based definition, and a click moves the message to its new
 * tab at once. The mail itself only moves in Outlook when the user presses "File mail"; until then it counts as waiting.
 */
export function MailBoard({ items, stats, timeZone }: { items: BoardItem[]; stats: BoardStats; timeZone: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<Record<string, Label>>({});

  // Fresh server data replaces the optimistic overlay.
  const [seen, setSeen] = useState(items);
  if (seen !== items) {
    setSeen(items);
    setOptimistic({});
  }

  const view = useMemo(() => {
    const lists: Record<Bucket, MessageItem[]> = { review: [], important: [], not_important: [] };
    const counts = { review: stats.review, important: stats.important, not_important: stats.notImportant };
    const pending = { important: stats.pendingImportant, not_important: stats.pendingNotImportant };
    for (const i of items) {
      const o = optimistic[i.id];
      const from = bucketOf(i);
      if (o && o !== from) {
        counts[from]--;
        counts[o]++;
      }
      if (o) {
        // The label now decides the target folder; it is "waiting" unless the message is already filed there.
        if (i.planned) pending[i.planned]--;
        if (o !== (i.planned ?? i.label)) pending[o]++;
      }
      lists[o ?? from].push(o ? { ...i, label: o } : i);
    }
    return { lists, counts, pending };
  }, [items, stats, optimistic]);

  async function onLabel(ids: string[], value: Label) {
    const previous = optimistic;
    setOptimistic((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, value])) }));
    try {
      await api("/api/label", "POST", { ids, label: value });
      toast.success(`${ids.length} marked ${value === "important" ? "important" : "not important"}`);
      startTransition(() => router.refresh());
    } catch (e) {
      setOptimistic(previous);
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  const waiting = (n: number) => (n > 0 ? `${n} waiting to be filed` : undefined);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Important" value={view.counts.important} hint={waiting(view.pending.important)} />
        <Stat label="Not important" value={view.counts.not_important} hint={waiting(view.pending.not_important)} />
        <Stat label="To review" value={view.counts.review} />
        <Stat label="In Junk folder" value={stats.junk} />
      </div>

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">To review ({view.counts.review})</TabsTrigger>
          <TabsTrigger value="important">Important ({view.counts.important})</TabsTrigger>
          <TabsTrigger value="not_important">Not important ({view.counts.not_important})</TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="pt-3">
          <MessageTable items={view.lists.review} timeZone={timeZone} emptyText="Nothing to review." onLabel={onLabel} />
        </TabsContent>
        <TabsContent value="important" className="pt-3">
          <MessageTable items={view.lists.important} timeZone={timeZone} emptyText="No important mail yet." onLabel={onLabel} />
        </TabsContent>
        <TabsContent value="not_important" className="pt-3">
          <MessageTable items={view.lists.not_important} timeZone={timeZone} emptyText="No mail set aside yet." onLabel={onLabel} />
        </TabsContent>
      </Tabs>
    </>
  );
}
