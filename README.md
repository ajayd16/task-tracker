# Task Tracker

Daily task tracker with auth and per-user data via Supabase. Today / Week / Calendar / All views, project bucketing, collaborators (per-user contacts), comments, CSV/JSON/Markdown export.

## Stack

- React 18 + Vite (static-site output)
- Supabase: Postgres + Auth + Row Level Security
- No backend code of our own — the React app talks to Supabase directly

## First-time setup

You'll do three things in the Supabase dashboard, then two things locally.

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign in, click **New project**.
2. Give it a name, pick a region close to your users, set a database password (save it — you won't need it for this app, but you might later).
3. Wait ~1 minute for provisioning.

### 2. Run the schema

1. In the left sidebar: **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo, copy the entire contents, paste, and click **Run**.

This creates 4 tables, sets up Row Level Security policies, and adds a trigger that seeds example tasks the moment a new user signs up. The script is idempotent — re-running it is safe.

### 3. Grab your keys

In the dashboard: **Project Settings** (gear icon) → **API**.
- **Project URL** → copy
- **anon / public key** → copy

The `anon` key is meant to be public — it ships in your frontend bundle, visible to anyone. RLS policies are what keep data safe, not key secrecy. Never expose the `service_role` key in frontend code.

### 4. Local environment

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=ey...
```

### 5. Run it

```bash
npm install
npm run dev
```

Vite prints a local URL. You'll land on the sign-in screen. Click "Create one", sign up with email + password.

**Important:** by default, Supabase requires email confirmation. Either:
- Click the confirmation link in the email Supabase sends you, then sign in, or
- Disable email confirmation in **Authentication → Providers → Email** (turn off "Confirm email") for faster testing — only do this for development.

Once signed in, the trigger will have already seeded 12 example tasks. They're tagged with example contacts (Aja, Mar, Ren, etc.) which are stored in your own `contacts` table, not shared with other users.

## Deploying to Vercel

The build is fully static — Vercel just serves the contents of `dist/`. The only deploy-time change from the localStorage version is that you need to set the two env vars in Vercel as well.

### Dashboard route

1. Push this repo to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import the repo. Vite is auto-detected.
3. Before clicking Deploy, expand **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. Deploy.

### CLI route

```bash
npm install -g vercel
vercel login
vercel              # first run: answers a few questions, deploys a preview
vercel env add VITE_SUPABASE_URL       # paste the value when prompted, pick all envs
vercel env add VITE_SUPABASE_ANON_KEY
vercel --prod
```

After deploying, go back to Supabase: **Authentication → URL Configuration** and add your Vercel URL (`https://your-app.vercel.app`) to **Site URL** and **Redirect URLs**. This is required for auth flows that involve email links.

## Architecture notes

### What lives where

```
supabase/schema.sql      — DB schema + RLS + signup trigger
.env.example             — template for VITE_SUPABASE_URL/ANON_KEY
src/supabaseClient.js    — singleton client
src/AuthGate.jsx         — sign-in/sign-up screen; gates the app
src/data.js              — async CRUD (loadTasks, upsertTask, deleteTask, addComment)
src/components.jsx       — task row/chip/modal, header, shared UI
src/charts.jsx           — pulse, donut, priority stack, heatmap (SVG)
src/views.jsx            — Today / Week / Calendar / All
src/main.jsx             — App root, mounts inside <AuthGate>
```

### Data model

- `profiles` — one row per auth user (mirrors `auth.users` for display fields).
- `tasks` — owned by `auth.users.id` via `owner_id`.
- `contacts` — per-user address book. "Collaborators" reference contacts, not real auth users. This decouples the collab UI from real multi-user accounts; you can label a task as "with Aja" without Aja needing an account.
- `task_collaborators` — join table.
- `task_comments` — separate rows; each comment has its own id, author (a contact), timestamp.

### Security

Every table has Row Level Security enabled. Every policy boils down to "you can only touch rows where `owner_id = auth.uid()`" (with task_collaborators/task_comments checking ownership via the parent task). The anon key in the frontend cannot escape these policies. The `service_role` key bypasses RLS and must never appear in client code.

### What changed vs. the localStorage version

1. `loadTasks` is async and fetches from Supabase on mount.
2. There's no `saveTasks(allTasks)` — instead, every CRUD action writes the affected task only (`upsertTask`, `deleteTask`). This avoids a network round-trip per keystroke in the modal.
3. UI updates are optimistic: local state changes first, network write follows, errors surface via `alert()` but don't roll back. Fine for single-user; revisit if you add cross-device sync.
4. A new `AuthGate` wraps the app, showing the sign-in screen until a session exists.

### Future extensions

- **Real multi-user collaboration**: add a `linked_user_id` column to `contacts`, share tasks via a `task_shares` table, broaden RLS to "owner OR shared-with".
- **Realtime sync**: enable Supabase Realtime on `tasks`, subscribe in `App` on mount, merge incoming changes into state. The data shape already supports this.
- **Migrations**: as the schema evolves, write each change as a new file under `supabase/` so you have a history.
