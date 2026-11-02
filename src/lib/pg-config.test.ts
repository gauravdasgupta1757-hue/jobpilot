import { describe, expect, it } from "vitest";

import { pgConfig } from "./pg-config";

describe("pgConfig", () => {
  it("leaves the connection string alone without a CA", () => {
    expect(pgConfig("postgresql://u:p@h:5432/db?sslmode=require", "")).toEqual({ connectionString: "postgresql://u:p@h:5432/db?sslmode=require" });
  });

  it("checks the server against the CA, with sslmode moved out of the string", () => {
    expect(pgConfig("postgresql://u:p@h:25060/db?sslmode=require&application_name=jp", "-----BEGIN CERTIFICATE-----")).toEqual({
      connectionString: "postgresql://u:p@h:25060/db?application_name=jp",
      ssl: { ca: "-----BEGIN CERTIFICATE-----", rejectUnauthorized: true },
    });
  });
});
