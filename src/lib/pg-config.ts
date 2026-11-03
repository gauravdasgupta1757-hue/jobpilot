import type { PoolConfig } from "pg";

// JobPilot: how to reach Postgres.
//
// Hosted databases (DigitalOcean's, for one) ask for TLS with their own
// certificate authority, given as DATABASE_CA_CERT. node-postgres lets the
// connection string's sslmode override the ssl option, so with a CA the TLS
// settings move out of the string and into the option, where the certificate
// is checked against it.
//
// Several people can share one database, each in their own schema
// (DATABASE_SCHEMA, which docker/start.sh adds to DATABASE_URL as
// `?schema=`, the way Prisma's migrations read it). The schema is passed to
// the adapter, not to Postgres.

const TLS_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"];

export type PgSetup = { pool: PoolConfig; schema: string | undefined };

export function pgSetup(connectionString: string | undefined, ca: string | undefined = process.env.DATABASE_CA_CERT): PgSetup {
  if (!connectionString) return { pool: { connectionString }, schema: undefined };
  const url = new URL(connectionString);
  const schema = url.searchParams.get("schema") || undefined;
  url.searchParams.delete("schema");
  if (!ca?.trim()) {
    return { pool: { connectionString: schema ? url.toString() : connectionString }, schema };
  }
  for (const param of TLS_PARAMS) url.searchParams.delete(param);
  return { pool: { connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true } }, schema };
}
