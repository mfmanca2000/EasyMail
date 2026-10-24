"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/client";

export function ActionsBar({ deletable }: { deletable: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [permanent, setPermanent] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);

  async function run<T>(key: string, fn: () => Promise<T>, done: (r: T) => string) {
    setBusy(key);
    try {
      toast.success(done(await fn()));
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const spin = (key: string, icon: React.ReactNode) =>
    busy === key ? <Loader2 className="animate-spin" /> : icon;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        disabled={!!busy}
        onClick={() =>
          run("sync", () => api<{ scanned: number; trained: number; moved: number }>("/api/sync", "POST"),
            (r) => `Read ${r.scanned} messages, learned from ${r.trained}${r.moved ? `, moved ${r.moved}` : ""}`)
        }
      >
        {spin("sync", <RefreshCw />)} Sync
      </Button>
      <Button
        variant="secondary"
        disabled={!!busy}
        onClick={() =>
          run("organize", () => api<{ moved: number; failed: number }>("/api/organize", "POST"),
            (r) => `Moved ${r.moved} messages${r.failed ? ` (${r.failed} failed)` : ""}`)
        }
      >
        {spin("organize", <CheckCheck />)} File mail into folders
      </Button>
      <Button
        variant="secondary"
        disabled={!!busy}
        onClick={() =>
          run("digest", () => api<{ sent: boolean; items: number; reason?: string }>("/api/digest", "POST"),
            (r) => (r.sent ? `Digest sent (${r.items} messages)` : `No digest: ${r.reason}`))
        }
      >
        {spin("digest", <Send />)} Send digest now
      </Button>

      <AlertDialog open={purgeOpen} onOpenChange={(o) => (busy === "purge" ? undefined : setPurgeOpen(o))}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={!!busy} className="sm:ml-auto">
            <Trash2 /> Delete all not important
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all not-important mail?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything in your Not Important folder and your Junk folder will be deleted (about {deletable} messages
              known to EasyMail). Messages you have not reviewed yet are included, so check the digest first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Switch id="permanent" checked={permanent} onCheckedChange={setPermanent} />
            <Label htmlFor="permanent">Delete permanently (skip the Deleted Items folder)</Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "purge"}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!!busy}
              onClick={async () => {
                await run("purge", () => api<{ deleted: number; failed: number }>("/api/purge", "POST", { permanent }),
                  (r) =>
                    `${permanent ? "Permanently deleted" : "Moved to Deleted Items:"} ${r.deleted} messages${r.failed ? ` (${r.failed} failed)` : ""}`);
                setPurgeOpen(false);
              }}
            >
              {spin("purge", <Trash2 />)} {busy === "purge" ? "Deleting..." : "Delete everything"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
