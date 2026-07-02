import { test, expect, describe } from "bun:test";
import { compositeEmployeeKey } from "../compositeEmployeeKey";

describe("compositeEmployeeKey", () => {
  test("single column returns the cell value as-is", () => {
    expect(compositeEmployeeKey({ emp_id: "101" }, ["emp_id"])).toBe("101");
  });

  test("multiple columns are space-joined in order", () => {
    expect(compositeEmployeeKey({ first: "John", last: "Smith" }, ["first", "last"])).toBe("John Smith");
  });

  test("order of columns is preserved", () => {
    expect(compositeEmployeeKey({ first: "John", last: "Smith" }, ["last", "first"])).toBe("Smith John");
  });

  test("missing column value is treated as empty string", () => {
    expect(compositeEmployeeKey({ first: "John" }, ["first", "last"])).toBe("John");
  });

  test("all columns missing produces empty string", () => {
    expect(compositeEmployeeKey({}, ["first", "last"])).toBe("");
  });

  test("empty column list returns empty string", () => {
    expect(compositeEmployeeKey({ emp_id: "101" }, [])).toBe("");
  });

  test("trims surrounding whitespace from the result", () => {
    expect(compositeEmployeeKey({ first: "John", last: "" }, ["first", "last"])).toBe("John");
  });
});
