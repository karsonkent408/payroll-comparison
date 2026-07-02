import { test, expect, describe } from "bun:test";
import { canModify, canView } from "@/lib/canModify";

describe("canModify", () => {
  const collaborators = [
    { userId: "u1", access: "viewer" },
    { userId: "u2", access: "editor" },
    { userId: "u3", access: "owner" },
  ];

  test("admin can modify any comparison regardless of collaborators", () => {
    expect(canModify("admin", "u99", [])).toBe(true);
    expect(canModify("admin", "u99", collaborators)).toBe(true);
  });

  test("implementor cannot modify unless a collaborator with editor or owner access", () => {
    expect(canModify("implementor", "u99", [])).toBe(false);
    expect(canModify("implementor", "u1", collaborators)).toBe(false);
    expect(canModify("implementor", "u2", collaborators)).toBe(true);
    expect(canModify("implementor", "u3", collaborators)).toBe(true);
  });

  test("editor can modify", () => {
    expect(canModify("guest", "u2", collaborators)).toBe(true);
  });

  test("owner can modify", () => {
    expect(canModify("guest", "u3", collaborators)).toBe(true);
  });

  test("viewer cannot modify", () => {
    expect(canModify("guest", "u1", collaborators)).toBe(false);
  });

  test("non-collaborator cannot modify", () => {
    expect(canModify("guest", "u99", collaborators)).toBe(false);
  });

  test("cannot modify when collaborator list is empty", () => {
    expect(canModify("guest", "u1", [])).toBe(false);
  });
});

describe("canView", () => {
  const collaborators = [
    { userId: "u1", access: "viewer" },
    { userId: "u2", access: "editor" },
    { userId: "u3", access: "owner" },
  ];

  test("admin can view any comparison", () => {
    expect(canView("admin", "u99", [])).toBe(true);
    expect(canView("admin", "u99", collaborators)).toBe(true);
  });

  test("implementor can view any comparison regardless of collaborators", () => {
    expect(canView("implementor", "u99", [])).toBe(true);
    expect(canView("implementor", "u99", collaborators)).toBe(true);
  });

  test("collaborator with viewer access can view", () => {
    expect(canView("guest", "u1", collaborators)).toBe(true);
  });

  test("collaborator with editor access can view", () => {
    expect(canView("guest", "u2", collaborators)).toBe(true);
  });

  test("collaborator with owner access can view", () => {
    expect(canView("guest", "u3", collaborators)).toBe(true);
  });

  test("non-collaborator cannot view", () => {
    expect(canView("guest", "u99", collaborators)).toBe(false);
    expect(canView("guest", "u99", [])).toBe(false);
  });
});
