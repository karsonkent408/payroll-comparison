import { test, expect, describe } from "bun:test";
import { computeEmployeeSummary } from "@/features/comparisons/components/employeeSummary";

describe("computeEmployeeSummary", () => {
  test("all employees paired → matched = N, skipped = 0 on both sides", () => {
    const result = computeEmployeeSummary(
      ["alice", "bob"],
      ["alice", "bob"],
      [
        { legacy_key: "alice", new_key: "alice" },
        { legacy_key: "bob", new_key: "bob" },
      ]
    );

    expect(result).toEqual({ matched: 2, skippedLegacy: 0, skippedNew: 0 });
  });

  test("one legacy employee not in any pair → skippedLegacy = 1", () => {
    const result = computeEmployeeSummary(
      ["alice", "bob"],
      ["alice"],
      [{ legacy_key: "alice", new_key: "alice" }]
    );

    expect(result).toEqual({ matched: 1, skippedLegacy: 1, skippedNew: 0 });
  });

  test("one new employee not in any pair → skippedNew = 1", () => {
    const result = computeEmployeeSummary(
      ["alice"],
      ["alice", "bob"],
      [{ legacy_key: "alice", new_key: "alice" }]
    );

    expect(result).toEqual({ matched: 1, skippedLegacy: 0, skippedNew: 1 });
  });

  test("skips on both sides → both skipped counts > 0", () => {
    const result = computeEmployeeSummary(
      ["alice", "bob"],
      ["alice", "carol"],
      [{ legacy_key: "alice", new_key: "alice" }]
    );

    expect(result).toEqual({ matched: 1, skippedLegacy: 1, skippedNew: 1 });
  });

  test("no pairs → all employees skipped", () => {
    const result = computeEmployeeSummary(["alice", "bob"], ["alice", "bob"], []);

    expect(result).toEqual({ matched: 0, skippedLegacy: 2, skippedNew: 2 });
  });

  test("no employees → all zeros", () => {
    const result = computeEmployeeSummary([], [], []);

    expect(result).toEqual({ matched: 0, skippedLegacy: 0, skippedNew: 0 });
  });
});
