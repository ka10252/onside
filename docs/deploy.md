# Deploying Onside (Vercel + Supabase)

Free tiers only. Supabase holds the database and private files. Vercel runs the app in the same region as the Supabase project (`regions` in `vercel.json`; `bom1` = Mumbai, `sin1` = Singapore), so page loads don't cross regions on every query.

## 1. Supabase (once)
1. Create a project. Keep the database password. Set `regions` in `vercel.json` to the matching Vercel region (Singapore → `sin1`, Mumbai → `bom1`); the region can't be changed after the project is created.
2. Put these in `.env.local` (never in git):
   - `DATABASE_URL`: **Connect → Transaction pooler** (port 6543), password filled in.
   - `SUPABASE_URL`: Project Settings → API → Project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: same page, `service_role` key (server only).
3. `npm run db:seed` creates the tables, turns on row level security, creates the private bucket `onside`, and loads units, questions, past-paper text and figures.
4. `npm run db:import-sqlite` copies accounts and student work from the old local file `data/onside.db` (one time).
5. Logins: `npm run account -- --id <id> --password <pw> --tutor` works against Supabase once `DATABASE_URL` is set.

Row level security is on for every table with no policies, so Supabase's public API (anon key) can't read anything. The app connects with the database password and the service role key, both server-side only.

## 2. Vercel (once)
1. Push the repository to a private GitHub repo and import it in Vercel (framework: Next.js).
2. Environment variables (Production): everything in `.env.example` that is set in `.env.local` — `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (and model names), `GEMINI_API_KEY`, `AI_MARKING_BATCH`, `HELPER_DAILY_LIMIT`.
3. Deploy. Every push to the main branch redeploys.

## Daily practice
- `vercel.json` sets when the morning cron runs: `0 23 * * *` is 23:00 UTC, about 7am in Singapore. The free plan runs it once a day and within the hour, so change the hour there if the tutor wants a different time.
- Set `CRON_SECRET` in `.env.local` and in the Vercel project (any long random string). Vercel sends it as a bearer token; the route turns away anyone else.
- Each student's schedule is set on their page in the app.

## Limits to know
- Function time: up to 300 s (`maxDuration` in `src/app/layout.tsx`). AI marking runs after the student's submit response (`after()`).
- Batch marking results are collected when the tutor opens the Students list or a review page; the review page refreshes itself while a batch is pending.
- Request bodies: about 4.5 MB. The browser shrinks diagram photos before upload.
- Supabase free projects pause after a week with no activity; open the dashboard to resume.
- Vercel's free (Hobby) plan is for personal, non-commercial use.

## Local work after this
- `npm run dev:local` is the one to use for looking at screens: it reads the copy in `data/pglite`, so pages render in milliseconds. `npm run db:pull` brings that copy up to date with Supabase (including diagram photos).
- `npm run dev` talks to Supabase. Every query crosses to the database's region (about 68 ms from Singapore, so a page can take seconds). Use it only when you need to see or change the live data.
- The local database is opened by one process at a time: stop `npm run dev:local` before `npm run db:pull` or `npm run db:migrate`, then start it again.
- `npm test` always uses the local database. `npm run db:reset` starts the local copy over.
