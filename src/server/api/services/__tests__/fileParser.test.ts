import { test, expect, describe } from "bun:test";
import { parseFile } from "@/server/api/services/fileParser";

describe("FileParser", () => {
  describe("CSV parsing", () => {
    test("parses well-formed CSV into headers and rows", () => {
      const csv = `employee_id,name,salary\n101,Alice,75000\n102,Bob,82000`;
      const buffer = Buffer.from(csv);

      const result = parseFile(buffer, "payroll.csv");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");

      expect(result.headers).toEqual(["employee_id", "name", "salary"]);
      expect(result.rows).toEqual([
        { employee_id: "101", name: "Alice", salary: "75000" },
        { employee_id: "102", name: "Bob", salary: "82000" },
      ]);
    });
  });

  describe("type detection", () => {
    test("detects 'number' when >90% of non-empty values are numeric", () => {
      // 9 numbers out of 10 non-empty = 90% → 'number'
      const csv = `id,amount\n1,100\n2,200\n3,300\n4,400\n5,500\n6,600\n7,700\n8,800\n9,900\n10,not-a-number`;
      const result = parseFile(Buffer.from(csv), "payroll.csv");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.detectedTypes["amount"]).toBe("number");
    });

    test("detects 'date' when >90% of non-empty values are dates", () => {
      const csv = `id,pay_date\n1,2024-01-15\n2,2024-02-15\n3,2024-03-15\n4,2024-04-15\n5,2024-05-15\n6,2024-06-15\n7,2024-07-15\n8,2024-08-15\n9,2024-09-15\n10,not-a-date`;
      const result = parseFile(Buffer.from(csv), "payroll.csv");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.detectedTypes["pay_date"]).toBe("date");
    });

    test("defaults to 'string' for non-numeric, non-date columns", () => {
      const csv = `id,name\n1,Alice\n2,Bob\n3,Carol`;
      const result = parseFile(Buffer.from(csv), "payroll.csv");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.detectedTypes["name"]).toBe("string");
    });

    test("mixed column falls back to 'string' when <90% match a type", () => {
      // 5 numbers, 5 strings = 50% → 'string'
      const csv = `id,value\n1,100\n2,200\n3,300\n4,400\n5,500\n6,foo\n7,bar\n8,baz\n9,qux\n10,quux`;
      const result = parseFile(Buffer.from(csv), "payroll.csv");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.detectedTypes["value"]).toBe("string");
    });

    test("empty cells are excluded from type detection numerator and denominator", () => {
      // 5 numbers + 5 empty cells → 5/5 non-empty = 100% → 'number'
      const csv = `id,amount\n1,100\n2,\n3,300\n4,\n5,500\n6,\n7,700\n8,\n9,900\n10,`;
      const result = parseFile(Buffer.from(csv), "payroll.csv");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.detectedTypes["amount"]).toBe("number");
    });
  });

  describe("CSV edge cases", () => {
    test("handles quoted fields containing commas", () => {
      const csv = `name,address\nAlice,"123 Main St, Suite 4"\nBob,"456 Oak Ave, Apt 2"`;
      const result = parseFile(Buffer.from(csv), "data.csv");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.rows[0]["address"]).toBe("123 Main St, Suite 4");
      expect(result.rows[1]["address"]).toBe("456 Oak Ave, Apt 2");
    });

    test("handles trailing comma without producing phantom column", () => {
      const csv = `id,name,\n1,Alice,\n2,Bob,`;
      const result = parseFile(Buffer.from(csv), "data.csv");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      // Third header is empty string — rows should still map correctly, not throw
      expect(result.headers).toHaveLength(3);
      expect(result.rows[0]["id"]).toBe("1");
      expect(result.rows[0]["name"]).toBe("Alice");
    });

    test("handles empty cells mid-row", () => {
      const csv = `id,name,department\n1,,Engineering\n2,Bob,`;
      const result = parseFile(Buffer.from(csv), "data.csv");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.rows[0]["name"]).toBe("");
      expect(result.rows[1]["department"]).toBe("");
    });
  });

  describe("malformed input", () => {
    test("returns error for empty CSV (no header row)", () => {
      const result = parseFile(Buffer.from(""), "data.csv");

      expect(result).toMatchObject({ ok: false });
      if (result.ok) throw new Error("expected error");
      expect(result.error).toMatch(/header/i);
    });

    test("returns error for unsupported file extension", () => {
      const result = parseFile(Buffer.from("data"), "data.txt");

      expect(result).toMatchObject({ ok: false });
      if (result.ok) throw new Error("expected error");
      expect(result.error).toMatch(/unsupported/i);
    });

    test("returns error for binary garbage passed as xlsx", () => {
      const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xde, 0xad, 0xbe, 0xef]);
      const result = parseFile(garbage, "data.xlsx");

      expect(result).toMatchObject({ ok: false });
      if (result.ok) throw new Error("expected error");
    });
  });

  describe("New two-row header", () => {
    // Sparse row 1 (4/10 non-empty = 40%) triggers grouping-row detection
    const newCsv = [
      `Employee,,,,,Totals,,,Employee benefit contributions,Company benefit contributions`,
      `Employee Name,Employee ID,Department,Crew,Title,Hours,Gross,Net,401k,401k`,
      `Alice,101,-,-,Engineer,40,2000,1600,100,50`,
    ].join("\n");

    test("keeps column name as-is when section name is already in it", () => {
      const result = parseFile(Buffer.from(newCsv), "register.csv");
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.headers).toContain("Employee Name");
      expect(result.headers).toContain("Employee ID");
    });

    test("prefixes column with section name when section is not in column name", () => {
      const result = parseFile(Buffer.from(newCsv), "register.csv");
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.headers).toContain("Employee Crew");
      expect(result.headers).toContain("Totals Hours");
      expect(result.headers).toContain("Totals Gross");
    });

    test("disambiguates duplicate column names using section prefix", () => {
      const result = parseFile(Buffer.from(newCsv), "register.csv");
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.headers).toContain("Employee benefit contributions 401k");
      expect(result.headers).toContain("Company benefit contributions 401k");
      // Raw "401k" must not appear — both occurrences must be prefixed
      expect(result.headers).not.toContain("401k");
    });

    test("data rows begin at row 3, skipping both header rows", () => {
      const result = parseFile(Buffer.from(newCsv), "register.csv");
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]["Employee Name"]).toBe("Alice");
      expect(result.rows[0]["Employee ID"]).toBe("101");
      expect(result.rows[0]["Totals Hours"]).toBe("40");
    });

    test("regular single-row header CSV is unaffected", () => {
      const csv = `employee_id,name,salary\n101,Alice,75000`;
      const result = parseFile(Buffer.from(csv), "payroll.csv");
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.headers).toEqual(["employee_id", "name", "salary"]);
      expect(result.rows).toHaveLength(1);
    });
  });

  describe("columnSections", () => {
    test("single-row CSV returns empty columnSections", () => {
      const csv = `employee_id,name,salary\n101,Alice,75000`;
      const result = parseFile(Buffer.from(csv), "payroll.csv");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.columnSections).toEqual({});
    });

    test("two-row New CSV maps every prefixed header to its section name", () => {
      const csv = [
        `Employee,,,,,Totals,,,Employee benefit contributions,Company benefit contributions`,
        `Employee Name,Employee ID,Department,Crew,Title,Hours,Gross,Net,401k,401k`,
        `Alice,101,-,-,Engineer,40,2000,1600,100,50`,
      ].join("\n");
      const result = parseFile(Buffer.from(csv), "register.csv");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.columnSections).toEqual({
        "Employee Name": "Employee",
        "Employee ID": "Employee",
        "Employee Department": "Employee",
        "Employee Crew": "Employee",
        "Employee Title": "Employee",
        "Totals Hours": "Totals",
        "Totals Gross": "Totals",
        "Totals Net": "Totals",
        "Employee benefit contributions 401k": "Employee benefit contributions",
        "Company benefit contributions 401k": "Company benefit contributions",
      });
    });
  });

  describe("Excel parsing", () => {
    test("returns empty columnSections for Excel files", () => {
      const XLSX = require("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([["id", "amount"], ["1", "100"]]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const xlsxBuffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const result = parseFile(xlsxBuffer, "payroll.xlsx");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");
      expect(result.columnSections).toEqual({});
    });

    test("parses well-formed .xlsx into headers and rows", () => {
      // Build a real .xlsx buffer using SheetJS so the test doesn't rely on a fixture file
      const XLSX = require("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([
        ["employee_id", "name", "salary"],
        ["101", "Alice", "75000"],
        ["102", "Bob", "82000"],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const xlsxBuffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const result = parseFile(xlsxBuffer, "payroll.xlsx");

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected ok");

      expect(result.headers).toEqual(["employee_id", "name", "salary"]);
      expect(result.rows).toEqual([
        { employee_id: "101", name: "Alice", salary: "75000" },
        { employee_id: "102", name: "Bob", salary: "82000" },
      ]);
    });
  });
});
