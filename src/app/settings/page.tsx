import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SettingsForm } from "@/components/settings-form";
import { Button } from "@/components/ui/button";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  const zones = Intl.supportedValuesOf("timeZone");
  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/" title="Back"><ArrowLeft /></Link>
        </Button>
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>
      <SettingsForm initial={settings} zones={zones} />
    </main>
  );
}
