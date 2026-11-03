// JobPilot: several people can share one Postgres server, each with their
// own database (DATABASE_NAME), so one free or small server holds every
// copy. Run by docker/start.sh before the migrations: creates the database
// when it's missing, then prints DATABASE_URL pointing at it.

import pg from "pg";

import { pgSetup } from "@/lib/pg-config";

async function main() {
  const base = process.env.DATABASE_URL;
  const name = process.env.DATABASE_NAME?.trim();
  if (!base || !name) throw new Error("ensure-database needs DATABASE_URL and DATABASE_NAME.");
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error("DATABASE_NAME may only have lowercase letters, digits and _, starting with a letter.");

  const client = new pg.Client(pgSetup(base).pool);
  await client.connect();
  try {
    const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (found.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
      console.error(`Created the database ${name}.`);
    }
  } finally {
    await client.end();
  }
  const url = new URL(base);
  url.pathname = `/${name}`;
  process.stdout.write(url.toString());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
