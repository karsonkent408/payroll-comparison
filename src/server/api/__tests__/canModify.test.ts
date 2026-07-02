import { test, expect, describe } from "bun:test";
import { canModify } from "@/shared/lib/canModify";

describe("canModify", () => {
  test("admin can modify any comparison", () => {
    expect(canModify("admin", "u1", [])).toBe(true);
  });

  test("owner can modify their own comparison", () => {
    expect(canModify("implementor", "u1", [{ userId: "u1", access: "owner" }])).toBe(true);
  });

  test("editor can modify a comparison", () => {
    expect(canModify("implementor", "u1", [{ userId: "u1", access: "editor" }])).toBe(true);
  });

  test("non-collaborator cannot modify", () => {
    expect(canModify("implementor", "u1", [{ userId: "u2", access: "owner" }])).toBe(false);
  });

  test("viewer cannot modify", () => {
    expect(canModify("implementor", "u1", [{ userId: "u1", access: "viewer" }])).toBe(false);
  });
});
