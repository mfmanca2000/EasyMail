import { Mail } from "lucide-react";
import { StorageWarning } from "@/components/storage-warning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 px-4">
      <StorageWarning />
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Mail className="size-5" /> EasyMail
          </CardTitle>
          <CardDescription>Sign in with your Hotmail / Outlook.com account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
          <Button asChild className="w-full">
            <a href="/api/auth/login">Sign in with Microsoft</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
