import { test, expect, describe } from "bun:test";
import { assignRole } from "../../../server/api/util/assignRole";

describe("assignRole", () => {
  test("returns 'implementor' for @domain.com emails", () => {
    expect(assignRole("user@domain.com")).toBe("implementor");
  });

  test("returns 'guest' for non-@domain.com emails", () => {
    expect(assignRole("outsider@example.com")).toBe("guest");
  });
});
