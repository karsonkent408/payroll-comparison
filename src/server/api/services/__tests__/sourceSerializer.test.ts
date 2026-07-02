import { test, expect, describe } from "bun:test";
import { serializeSourceCsv } from "@/server/api/services/sourceSerializer";

describe("serializeSourceCsv", () => {
  test("serializes headers and rows into a valid CSV string", () => {
    const headers = ["emp_id", "salary"];
    const rows = [
      { emp_id: "101", salary: "75000" },
      { emp_id: "102", salary: "82000" },
    ];
    const result = serializeSourceCsv(headers, rows);
    expect(result).toBe("emp_id,salary\r\n101,75000\r\n102,82000");
  });

  test("returns only the header row when rows is empty", () => {
    const result = serializeSourceCsv(["emp_id", "salary"], []);
    expect(result).toBe("emp_id,salary");
  });

  test("quotes a field that contains a comma", () => {
    const result = serializeSourceCsv(["name"], [{ name: "Smith, John" }]);
    expect(result).toBe('name\r\n"Smith, John"');
  });

  test("escapes double-quotes by doubling them and wraps the field", () => {
    const result = serializeSourceCsv(["note"], [{ note: 'say "hello"' }]);
    expect(result).toBe('note\r\n"say ""hello"""');
  });

  test("quotes a field that contains a newline", () => {
    const result = serializeSourceCsv(["addr"], [{ addr: "line1\nline2" }]);
    expect(result).toBe('addr\r\n"line1\nline2"');
  });
});
