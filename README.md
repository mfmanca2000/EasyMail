# EasyMail

Sorts a Hotmail / Outlook.com mailbox into just two folders, **Important** and **Not Important**, learns from your corrections, and once a day drops a digest of everything it set aside into Important so you can check nothing was missed. A button deletes all the not-important mail (junk included).

It is a Next.js web app (TypeScript, shadcn/ui, zod, TanStack Table) that installs on your phone as a PWA.

## How it works

- **Reads every folder** through the Microsoft Graph API (Sent, Drafts and Deleted Items are ignored). Junk mail is read too and shown with an amber **Junk** badge.
- **Learns from you.** A small on-line Naive-Bayes classifier looks at sender, sender domain, subject and preview words, and whether the mail came from Junk. It learns from (a) the Important / Not important buttons and (b) mail you drag into the two folders in Outlook. Mail the app moved on its own is *not* learned from until you confirm it, so it can't reinforce its own mistakes.
- **Nothing moves until you allow it.** Until ~10 messages are labelled it makes no suggestions. "File mail into folders" (or the *auto* setting) moves mail you labelled plus predictions above the confidence threshold (default 85%). Mail in your own custom folders is only moved if you labelled it yourself.
- **Daily digest.** At the configured hour (and time zone) the app mails you a digest, filed into Important. With `ANTHROPIC_API_KEY` set it adds a short overview and a "worth a second look" list written by Claude; without it you get a plain grouped list. Digest subjects start with `[EasyMail]`, which is always classed important.
- **Delete all not important** empties the Not Important and Junk folders (to Deleted Items, or permanently if you tick the switch).

## Setup

### 1. Register a Microsoft app (once, free)
1. <https://entra.microsoft.com> → *App registrations* → *New registration*. Supported account types: **Personal Microsoft accounts only** (or "any directory and personal"). You need a free Azure/Entra login to do this; it doesn't touch your mailbox.
2. Redirect URI (platform *Web*): `<APP_URL>/api/auth/callback` (e.g. `http://localhost:3000/api/auth/callback`; add your deployed URL too).
3. *API permissions* → Microsoft Graph → *Delegated*: `Mail.ReadWrite`, `Mail.Send`, `User.Read`, `offline_access`.
4. *Certificates & secrets* → new client secret. Copy its **value**.

### 2. Configure
```bash
npm install
cp .env.example .env.local   # fill in MS_CLIENT_ID, MS_CLIENT_SECRET, ALLOWED_EMAIL, secrets…
npm run dev
```
Open <http://localhost:3000>, sign in, press **Sync**.

### 3. Deploy so it works from your phone and on a schedule
- Deploy to Vercel. The local SQLite file doesn't persist there, so create a free [Turso](https://turso.tech) database and set `DATABASE_URL` / `DATABASE_AUTH_TOKEN`. Set the other variables from `.env.example`, with `APP_URL` as your Vercel URL.
- `vercel.json` registers an hourly cron (`/api/cron/run`: sync, optional auto-filing, digest when due). Vercel's **Hobby plan only allows daily crons**; on Hobby either change the schedule to once a day or call `GET /api/cron/run` hourly from any scheduler (GitHub Actions, cron-job.org) with header `Authorization: Bearer $CRON_SECRET`. The digest sends on the first run at/after your chosen hour.
- On your phone open the URL in Chrome → menu → **Add to Home screen / Install app**.

## Privacy
Only the single `ALLOWED_EMAIL` account can sign in. The Microsoft refresh token and message metadata (sender, subject, 300-char preview) are stored in your database. If you set `ANTHROPIC_API_KEY`, sender/subject/preview snippets of set-aside mail are sent to Anthropic to write the digest; leave it unset to keep everything local.

## Development
`npm run lint`, `npm run build`. The classifier is a pure module (`src/lib/classifier.ts`); Graph access is in `src/lib/graph.ts`; sync / learn / move / purge in `src/lib/mail.ts`; the digest in `src/lib/digest.ts`.
