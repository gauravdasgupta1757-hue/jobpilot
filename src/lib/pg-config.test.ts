import { describe, expect, it } from "vitest";

import { pgSetup } from "./pg-config";

describe("pgSetup", () => {
  it("leaves the connection string alone without a CA or a schema", () => {
    expect(pgSetup("postgresql://u:p@h:5432/db?sslmode=require", "")).toEqual({ pool: { connectionString: "postgresql://u:p@h:5432/db?sslmode=require" }, schema: undefined });
  });

  it("checks the server against the CA, with sslmode moved out of the string", () => {
    expect(pgSetup("postgresql://u:p@h:25060/db?sslmode=require&application_name=jp", "-----BEGIN CERTIFICATE-----")).toEqual({
      pool: { connectionString: "postgresql://u:p@h:25060/db?application_name=jp", ssl: { ca: "-----BEGIN CERTIFICATE-----", rejectUnauthorized: true } },
      schema: undefined,
    });
  });

  it("gives the schema to the adapter, not to Postgres", () => {
    expect(pgSetup("postgresql://u:p@h/db?schema=gd", "")).toEqual({ pool: { connectionString: "postgresql://u:p@h/db" }, schema: "gd" });
  });
});
