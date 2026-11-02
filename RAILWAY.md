# Running JobPilot on Railway

Each person gets their own copy: their own Railway service, database, password and link. Nobody sees anyone else's data.

## One copy, once

1. **New project** → **Deploy from GitHub repo** → `jobpilot`. Railway reads `railway.json` and builds the `Dockerfile`.
2. In the same project: **+ Create** → **Database** → **PostgreSQL**.
3. On the JobPilot service, **Variables** → add:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway fills it in) |
   | `DOSSIER_PASSWORD` | the `argon2id:…` hash of this person's password (see below) |
   | `DOSSIER_SECRET` | 32+ random characters, e.g. from `openssl rand -base64 32` |
   | `TZ` | `Asia/Kolkata` |

4. **Settings** → **Networking** → **Generate Domain**. That's the link the person opens.
5. Optional, for nightly backups: **+ Create** → **Volume**, mounted at `/data` on the JobPilot service.

The first deploy takes a few minutes: it builds the app, sets up the database tables and loads the built-in resume themes. `numReplicas` stays at 1: the inbox check, the job agent and the backups run inside the app, so two copies would do them twice.

## Making a password hash

Any machine with Docker:

```bash
docker run --rm -it ghcr.io/aientech/dossier hash-password
```

Or from this repository with Node 24: `echo 'the-password' | npx tsx scripts/hash-password.ts`.

## After it's up

The person signs in at their link and, in **Settings**:

- **AI provider**: an Anthropic or OpenAI key, for tailoring and replies.
- **Job search**: JSearch and/or Adzuna keys; FreeHire needs none. Find jobs searches all of them at once.
- **Google**: connects Gmail and Calendar, so applications sent from LinkedIn, Naukri and other sites log themselves and replies land on the board. Needs a Google OAuth client; see the wiki's "Connecting Gmail and Calendar".
