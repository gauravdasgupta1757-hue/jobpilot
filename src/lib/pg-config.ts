import type { PoolConfig } from "pg";

// JobPilot: how to reach Postgres. Hosted databases (DigitalOcean's, for one)
// ask for TLS with their own certificate authority, given as
// DATABASE_CA_CERT. node-postgres lets the connection string's sslmode
// override the ssl option, so with a CA the TLS settings move out of the
// string and into the option, where the certificate is checked against it.

const TLS_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"];

export function pgConfig(connectionString: string | undefined, ca: string | undefined = process.env.DATABASE_CA_CERT): PoolConfig {
  if (!connectionString || !ca?.trim()) return { connectionString };
  const url = new URL(connectionString);
  for (const param of TLS_PARAMS) url.searchParams.delete(param);
  return { connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true } };
}
