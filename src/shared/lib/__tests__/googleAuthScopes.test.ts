import { test, expect } from "bun:test";
import { GOOGLE_AUTH_SCOPES } from "@/server/api/util/auth";

test("Google auth scopes include drive.file for Sheets export", () => {
  expect(GOOGLE_AUTH_SCOPES).toContain(
    "https://www.googleapis.com/auth/drive.file"
  );
});
