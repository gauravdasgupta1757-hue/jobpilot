# Running JobPilot on Render

Each person gets their own copy: their own app, database, password and link.

1. Sign in at [dashboard.render.com](https://dashboard.render.com) with GitHub.
2. **New** → **Blueprint** → choose the `jobpilot` repository. Render reads `render.yaml`.
3. Give the copy a name (e.g. `jobpilot-gd`) and, when asked, paste this person's `DOSSIER_PASSWORD`: the `argon2id:…` hash of their password (`echo 'the-password' | npx tsx scripts/hash-password.ts`, or `docker run --rm -it ghcr.io/aientech/dossier hash-password`).
4. **Apply**. The first build takes about ten minutes. The link is on the `jobpilot` service's page (`https://jobpilot-….onrender.com`).

For a second person, repeat with another Blueprint name and their own password hash.

Cost per copy, at Render's prices in late 2026: Starter web service ($7/month) plus Basic-256mb Postgres ($6/month plus storage). If downloading resume PDFs fails for lack of memory, move the service to Standard.

After signing in, the person sets up **Settings → AI provider**, **Job search** and **Google** as in RAILWAY.md.
