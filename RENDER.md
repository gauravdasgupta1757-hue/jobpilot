# Running JobPilot on Render

Each person gets their own copy: their own app, database, password and link.

1. Sign in at [dashboard.render.com](https://dashboard.render.com) with GitHub.
2. **New** → **Blueprint** → choose the `jobpilot` repository. Render reads `render.yaml`.
3. Give the copy a name (e.g. `jobpilot-gd`) and, when asked, paste this person's `DOSSIER_PASSWORD`: the `argon2id:…` hash of their password (`echo 'the-password' | npx tsx scripts/hash-password.ts`, or `docker run --rm -it ghcr.io/aientech/dossier hash-password`).
4. **Apply**. The first build takes about ten minutes. The link is on the `jobpilot` service's page (`https://jobpilot-….onrender.com`).

For a second person, repeat with another Blueprint name and their own password hash.

`render.yaml` starts on Render's free plans, to try it out: the app sleeps after 15 minutes without visits (the inbox check pauses until someone opens it), and the free database is deleted after 30 days. To keep it, move the service to **Starter** ($7/month) and the database to **Basic-256mb** ($6/month plus storage) in the dashboard; the data stays. If downloading resume PDFs fails for lack of memory, move the service up a size.

After signing in, the person sets up **Settings → AI provider**, **Job search** and **Google** as in RAILWAY.md.
