import { test, expect, describe } from "bun:test";
import { buildAutoEntries } from "../../newAutoMap";

describe("buildAutoEntries", () => {
  test("Hours entries have tolerance 0", () => {
    const result = buildAutoEntries(
      ["Totals Hours"],
      { "Totals Hours": "Totals" }
    );

    expect(result[0]).toMatchObject({ category: "Hours", tolerance: 0 });
  });

  test("non-Hours entries have no tolerance set (defaults to MapColumns default)", () => {
    const result = buildAutoEntries(
      ["Earnings Overtime"],
      { "Earnings Overtime": "Earnings" }
    );

    expect(result[0].tolerance).toBeUndefined();
  });

  test("Reimbursements columns map to Non-Taxed Earnings", () => {
    const result = buildAutoEntries(
      ["Reimbursements Cell Phone"],
      { "Reimbursements Cell Phone": "Reimbursements" }
    );

    expect(result[0]).toMatchObject({ category: "Non-Taxed Earnings", label: "Cell Phone" });
  });

  test("Employee benefit contributions columns map to Benefits", () => {
    const result = buildAutoEntries(
      ["Employee benefit contributions 401k"],
      { "Employee benefit contributions 401k": "Employee benefit contributions" }
    );

    expect(result[0]).toMatchObject({ category: "Benefits", label: "401k" });
  });

  test("Company benefit contributions columns map to Benefits with Employer prefix on label", () => {
    const result = buildAutoEntries(
      ["Company benefit contributions 401k"],
      { "Company benefit contributions 401k": "Company benefit contributions" }
    );

    expect(result[0]).toMatchObject({ category: "Benefits", label: "Employer 401k" });
  });

  test("Post tax deductions columns map to Deductions", () => {
    const result = buildAutoEntries(
      ["Post tax deductions Child Support"],
      { "Post tax deductions Child Support": "Post tax deductions" }
    );

    expect(result[0]).toMatchObject({ category: "Deductions", label: "Child Support" });
  });

  test("Fringes columns map to Fringes", () => {
    const result = buildAutoEntries(
      ["Fringes Health & Welfare"],
      { "Fringes Health & Welfare": "Fringes" }
    );

    expect(result[0]).toMatchObject({ category: "Fringes", label: "Health & Welfare" });
  });

  test("Company taxes Unemployment columns map to Taxes with Employer prefix added to label", () => {
    const result = buildAutoEntries(
      ["Company taxes Federal Unemployment Tax", "Company taxes Michigan State Unemployment Tax"],
      {
        "Company taxes Federal Unemployment Tax": "Company taxes",
        "Company taxes Michigan State Unemployment Tax": "Company taxes",
      }
    );

    expect(result).toEqual([
      { legacy_columns: [], new_columns: ["Company taxes Federal Unemployment Tax"], category: "Taxes", label: "Employer Federal Unemployment Tax" },
      { legacy_columns: [], new_columns: ["Company taxes Michigan State Unemployment Tax"], category: "Taxes", label: "Employer Michigan State Unemployment Tax" },
    ]);
  });

  test("Company taxes Employer SS and Medicare columns map to FICA with label unchanged", () => {
    const result = buildAutoEntries(
      ["Company taxes Employer Social Security Tax", "Company taxes Employer Medicare Tax"],
      {
        "Company taxes Employer Social Security Tax": "Company taxes",
        "Company taxes Employer Medicare Tax": "Company taxes",
      }
    );

    expect(result).toEqual([
      { legacy_columns: [], new_columns: ["Company taxes Employer Social Security Tax"], category: "FICA", label: "Employer Social Security Tax" },
      { legacy_columns: [], new_columns: ["Company taxes Employer Medicare Tax"], category: "FICA", label: "Employer Medicare Tax" },
    ]);
  });

  test("Employee taxes income tax columns map to Taxes", () => {
    const result = buildAutoEntries(
      ["Employee taxes Federal Income Tax", "Employee taxes Michigan State Tax"],
      {
        "Employee taxes Federal Income Tax": "Employee taxes",
        "Employee taxes Michigan State Tax": "Employee taxes",
      }
    );

    expect(result).toEqual([
      { legacy_columns: [], new_columns: ["Employee taxes Federal Income Tax"], category: "Taxes", label: "Federal Income Tax" },
      { legacy_columns: [], new_columns: ["Employee taxes Michigan State Tax"], category: "Taxes", label: "Michigan State Tax" },
    ]);
  });

  test("Employee taxes Social Security and Medicare columns map to FICA", () => {
    const result = buildAutoEntries(
      ["Employee taxes Social Security Tax", "Employee taxes Medicare"],
      {
        "Employee taxes Social Security Tax": "Employee taxes",
        "Employee taxes Medicare": "Employee taxes",
      }
    );

    expect(result).toEqual([
      { legacy_columns: [], new_columns: ["Employee taxes Social Security Tax"], category: "FICA", label: "Social Security Tax" },
      { legacy_columns: [], new_columns: ["Employee taxes Medicare"], category: "FICA", label: "Medicare" },
    ]);
  });

  test("Totals Gross maps to Earnings and appears after other Earnings entries", () => {
    const result = buildAutoEntries(
      ["Earnings Overtime", "Totals Gross", "Earnings Hourly (Regular)"],
      {
        "Earnings Overtime": "Earnings",
        "Totals Gross": "Totals",
        "Earnings Hourly (Regular)": "Earnings",
      }
    );

    const earningsEntries = result.filter((e) => e.category === "Earnings");
    expect(earningsEntries.at(-1)).toMatchObject({ new_columns: ["Totals Gross"], label: "Gross" });
    expect(earningsEntries.length).toBe(3);
  });

  test("Totals Hours maps to Hours and Totals Net maps to Net", () => {
    const result = buildAutoEntries(
      ["Totals Hours", "Totals Net"],
      { "Totals Hours": "Totals", "Totals Net": "Totals" }
    );

    expect(result).toEqual([
      { legacy_columns: [], new_columns: ["Totals Hours"], category: "Hours", label: "Hours", tolerance: 0 },
      { legacy_columns: [], new_columns: ["Totals Net"], category: "Net", label: "Net" },
    ]);
  });

  test("unrecognized section columns are excluded silently", () => {
    const result = buildAutoEntries(
      ["Mystery Foo"],
      { "Mystery Foo": "Mystery" }
    );

    expect(result).toEqual([]);
  });

  test("Employee section columns are excluded", () => {
    const result = buildAutoEntries(
      ["Employee Name", "Employee ID"],
      { "Employee Name": "Employee", "Employee ID": "Employee" }
    );

    expect(result).toEqual([]);
  });

  test("Earnings column maps to Earnings category with section prefix stripped from label", () => {
    const result = buildAutoEntries(
      ["Earnings Overtime"],
      { "Earnings Overtime": "Earnings" }
    );

    expect(result).toEqual([
      { legacy_columns: [], new_columns: ["Earnings Overtime"], category: "Earnings", label: "Overtime" },
    ]);
  });

  describe("similar-name merging", () => {
    test("merges plural variant into same entry and uses longest label", () => {
      const result = buildAutoEntries(
        ["Employee benefit contributions 401k contribution", "Employee benefit contributions 401k contributions"],
        {
          "Employee benefit contributions 401k contribution": "Employee benefit contributions",
          "Employee benefit contributions 401k contributions": "Employee benefit contributions",
        }
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        label: "401k contributions",
        new_columns: [
          "Employee benefit contributions 401k contribution",
          "Employee benefit contributions 401k contributions",
        ],
        category: "Benefits",
      });
    });

    test("merges abbreviated label into full label", () => {
      const result = buildAutoEntries(
        ["Post tax deductions Health Insur", "Post tax deductions Health Insurance"],
        {
          "Post tax deductions Health Insur": "Post tax deductions",
          "Post tax deductions Health Insurance": "Post tax deductions",
        }
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        label: "Health Insurance",
        new_columns: [
          "Post tax deductions Health Insur",
          "Post tax deductions Health Insurance",
        ],
        category: "Deductions",
      });
    });

    test("merges short prefix into longer label", () => {
      const result = buildAutoEntries(
        ["Employee benefit contributions 401k", "Employee benefit contributions 401k contributions"],
        {
          "Employee benefit contributions 401k": "Employee benefit contributions",
          "Employee benefit contributions 401k contributions": "Employee benefit contributions",
        }
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        label: "401k contributions",
        category: "Benefits",
      });
    });

    test("does not merge similar labels across different categories", () => {
      const result = buildAutoEntries(
        ["Employee benefit contributions 401k", "Post tax deductions 401k"],
        {
          "Employee benefit contributions 401k": "Employee benefit contributions",
          "Post tax deductions 401k": "Post tax deductions",
        }
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ label: "401k", category: "Benefits" });
      expect(result[1]).toMatchObject({ label: "401k", category: "Deductions" });
    });

    test("does not merge labels where shorter is under 4 chars", () => {
      const result = buildAutoEntries(
        ["Employee benefit contributions HSA", "Employee benefit contributions HSA contribution"],
        {
          "Employee benefit contributions HSA": "Employee benefit contributions",
          "Employee benefit contributions HSA contribution": "Employee benefit contributions",
        }
      );

      // "hsa" normalizes to "hs" after stripping trailing 's' — length 2, below threshold
      // so these should NOT merge
      expect(result).toHaveLength(2);
    });
  });
});
