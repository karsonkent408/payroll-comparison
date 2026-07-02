import { test, expect, describe } from "bun:test";
import { tokenOverlap, computeFuzzyCandidatesFromKeys } from "../fuzzyMatch";

describe("computeFuzzyCandidatesFromKeys", () => {
  test("legacy employee with token overlap appears as a candidate", () => {
    const result = computeFuzzyCandidatesFromKeys(["Smith John"], ["John Smith"]);
    expect(result).toHaveLength(1);
    expect(result[0].legacy_key).toBe("Smith John");
    expect(result[0].new_key).toBe("John Smith");
    expect(result[0].overlap).toBe(1);
    expect(result[0].conflict).toBe(false);
  });

  test("zero-overlap pairs are excluded from candidates", () => {
    const result = computeFuzzyCandidatesFromKeys(["Alice Jones"], ["Bob Williams"]);
    expect(result).toHaveLength(0);
  });

  test("conflict is flagged when two legacy employees overlap the same new employee", () => {
    const result = computeFuzzyCandidatesFromKeys(
      ["J Smith", "John Smith Jr"],
      ["John Smith"]
    );
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.conflict)).toBe(true);
    expect(result.every((c) => c.new_key === "John Smith")).toBe(true);
  });

  test("conflict is false when only one legacy employee overlaps a new employee", () => {
    const result = computeFuzzyCandidatesFromKeys(
      ["J Smith", "Alice Jones"],
      ["John Smith", "Bob Williams"]
    );
    const smithCandidate = result.find((c) => c.new_key === "John Smith");
    expect(smithCandidate).toBeDefined();
    expect(smithCandidate!.conflict).toBe(false);
  });

  test("employees with exact key match are excluded from candidates", () => {
    const result = computeFuzzyCandidatesFromKeys(["John Smith"], ["John Smith"]);
    expect(result).toHaveLength(0);
  });
});

describe("tokenOverlap", () => {
  test("identical strings return 1", () => {
    expect(tokenOverlap("John Smith", "John Smith")).toBe(1);
  });

  test("zero-overlap strings return 0", () => {
    expect(tokenOverlap("Alice Jones", "Bob Williams")).toBe(0);
  });

  test("name-order reversal returns 1", () => {
    expect(tokenOverlap("Smith John", "John Smith")).toBe(1);
  });

  test("middle name reduces overlap below 1", () => {
    // tokens: {john, smith} vs {john, a, smith} → intersection 2, union 3 → 2/3
    expect(tokenOverlap("John Smith", "John A Smith")).toBeCloseTo(2 / 3);
  });

  test("punctuation is treated as a delimiter", () => {
    expect(tokenOverlap("Smith, John", "Smith John")).toBe(1);
  });

  test("empty string against any string returns 0", () => {
    expect(tokenOverlap("", "John Smith")).toBe(0);
    expect(tokenOverlap("John Smith", "")).toBe(0);
    expect(tokenOverlap("", "")).toBe(0);
  });
});
