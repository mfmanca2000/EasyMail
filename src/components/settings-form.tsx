"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/client";
import { settingsSchema, type Settings } from "@/lib/settings-schema";

export function SettingsForm({ initial, zones }: { initial: Settings; zones: string[] }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  async function save() {
    const parsed = settingsSchema.safeParse(s);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid settings");
      return;
    }
    setSaving(true);
    try {
      await api("/api/settings", "PUT", parsed.data);
      toast.success("Settings saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const row = "flex items-center justify-between gap-4";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Daily digest</CardTitle>
          <CardDescription>A summary of what was set aside, delivered into your Important folder.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={row}>
            <Label htmlFor="digestEnabled">Send the digest</Label>
            <Switch id="digestEnabled" checked={s.digestEnabled} onCheckedChange={(v) => set("digestEnabled", v)} />
          </div>
          <div className={row}>
            <Label htmlFor="digestHour">Send at (hour, 0–23)</Label>
            <Input id="digestHour" type="number" min={0} max={23} className="w-24" value={s.digestHour}
              onChange={(e) => set("digestHour", Number(e.target.value))} />
          </div>
          <div className={row}>
            <Label htmlFor="tz">Time zone</Label>
            <select id="tz" value={s.timezone} onChange={(e) => set("timezone", e.target.value)}
              className="h-9 max-w-[16rem] rounded-md border border-input bg-background px-2 text-sm">
              {zones.map((z) => <option key={z}>{z}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sorting</CardTitle>
          <CardDescription>The scheduler syncs once a day. Nothing is moved unless you allow it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={row}>
            <Label htmlFor="auto">Move mail into the two folders automatically</Label>
            <Switch id="auto" checked={s.autoOrganize} onCheckedChange={(v) => set("autoOrganize", v)} />
          </div>
          <div className={row}>
            <Label htmlFor="thr">Minimum confidence for automatic moves (0.5–0.99)</Label>
            <Input id="thr" type="number" step={0.01} min={0.5} max={0.99} className="w-24" value={s.confidenceThreshold}
              onChange={(e) => set("confidenceThreshold", Number(e.target.value))} />
          </div>
          <div className={row}>
            <Label htmlFor="custom">Also move predicted mail out of my own custom folders</Label>
            <Switch id="custom" checked={s.moveFromCustomFolders} onCheckedChange={(v) => set("moveFromCustomFolders", v)} />
          </div>
          <div className={row}>
            <Label htmlFor="imp">Important folder name</Label>
            <Input id="imp" className="w-48" value={s.importantFolder} onChange={(e) => set("importantFolder", e.target.value)} />
          </div>
          <div className={row}>
            <Label htmlFor="not">Not-important folder name</Label>
            <Input id="not" className="w-48" value={s.notImportantFolder} onChange={(e) => set("notImportantFolder", e.target.value)} />
          </div>
          <div className={row}>
            <Label htmlFor="reviewDays">Hide unreviewed mail older than (days, 0 = never hide)</Label>
            <Input id="reviewDays" type="number" min={0} max={3650} className="w-24" value={s.reviewDays}
              onChange={(e) => set("reviewDays", Number(e.target.value))} />
          </div>
          <div className={row}>
            <Label htmlFor="depth">Messages read per folder on each sync</Label>
            <Input id="depth" type="number" min={25} max={1000} className="w-24" value={s.syncDepth}
              onChange={(e) => set("syncDepth", Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
    </div>
  );
}
