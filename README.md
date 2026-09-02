# Regina Resume Backend

Next.js App Router API, Supabase data layer, and authenticated Admin CMS for Regina Septianadrah's resume.

## Features

- Aggregated public resume API with ordered nested projects.
- Validated and rate-limited contact form storage.
- Supabase Auth admin allowlist.
- Six-hour, server-enforced CMS session using an HttpOnly signed cookie.
- CRUD for profile, social links, skills, education, experiences, projects, and contact inbox.
- Avatar and PDF uploads through a public Supabase Storage bucket.
- Read-only Laravel SQLite exporter and idempotent Supabase seed.

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and fill every value. Generate `ADMIN_SESSION_SECRET` with `openssl rand -base64 48`.
3. Apply `supabase/migrations/20260828000000_create_resume_schema.sql` in the Supabase SQL Editor.
4. Create the admin user using `npm run seed:admin` (or `npm run seed:admin your-email@example.com yourpassword`). This creates/updates the user in Supabase Auth and updates `ADMIN_EMAILS` in `.env.local`.
5. Run `npm run export:laravel` while the old Laravel repository is available beside `migration-workspace`, or set `LARAVEL_SQLITE_PATH` to its SQLite file.
6. Run `npm run verify:export` and `npm run seed:resume`.
7. Run `npm run dev`, then open `/admin`.

The seed uses stable Laravel IDs and upserts records. It never mass-deletes database content.

## Admin session

Signing in creates a separate, signed HttpOnly CMS session that expires exactly six hours after login. Refreshing the browser or Supabase token does not extend it. When it expires, protected admin API calls return `401` and the CMS signs out automatically.

The secret is required in every environment:

```bash
openssl rand -base64 48
```

Store the generated value only as `ADMIN_SESSION_SECRET` in local environment files and Vercel; do not commit it.

## API

| Method | Route | Access |
|---|---|---|
| GET | `/api/health` | Public |
| GET | `/api/v1/resume` | Public |
| POST | `/api/v1/contact` | Public, 5 requests/hour per IP and email |
| GET/POST/DELETE | `/api/admin/session` | Authenticated allowlisted admin |
| GET/PUT | `/api/admin/profile` | Admin session |
| GET/POST | `/api/admin/{resource}` | Admin session |
| GET/PUT/DELETE | `/api/admin/{resource}/{id}` | Admin session |
| POST | `/api/admin/upload` | Admin session |

Admin resources are `social-links`, `skills`, `education`, `experiences`, `projects`, and `contact-messages`. Contact messages are read-only in the CMS.

## Deployment

Deploy to Vercel and set all variables from `.env.example`. Set `FRONTEND_URL` to the exact Cloudflare Pages/custom-domain origin without a trailing slash. Set `ADMIN_SESSION_SECRET` in both the Preview and Production environments, then redeploy. Existing CMS browser sessions must sign in once after this release because they do not have the new server session cookie.

The public resume response uses `Cache-Control: no-store`, so admin changes are visible without cache invalidation.
