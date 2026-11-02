# Running JobPilot on DigitalOcean App Platform

Each person gets their own app: their own database, password and link. `.do/app.yaml` describes one.

1. Sign in at [cloud.digitalocean.com](https://cloud.digitalocean.com) and add a payment method.
2. **Create** → **App Platform** → **GitHub** → `jobpilot`, branch `main`. Or edit the app's spec and paste `.do/app.yaml`.
3. Region **Bangalore**, one container of **1 GB** ($10/month), and a **Dev Database** (PostgreSQL, $7/month), named `db`.
4. Environment variables on the `web` service:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${db.DATABASE_URL}` |
   | `DATABASE_CA_CERT` | `${db.CA_CERT}` |
   | `DOSSIER_PASSWORD` | the `argon2id:…` hash of this person's password, encrypted |
   | `DOSSIER_SECRET` | 32+ random characters, encrypted |
   | `TZ` | `Asia/Kolkata` |

5. **Create resources**. The first build takes about ten minutes; the link (`https://jobpilot-….ondigitalocean.app`) is on the app's page.

App Platform has no lasting disk, so nightly backups and PDF zips go when the app restarts; everything in the database stays. Use **Settings → Export** for a copy to keep.

After signing in, the person sets up **Settings → AI provider**, **Job search** and **Google** as in RAILWAY.md.
