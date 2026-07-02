import { test, expect, describe } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { MultiSelect } from "../multi-select";

const OPTIONS = ["gross", "net", "tax"];

function Controlled({ initial = [] as string[] }) {
  const [value, setValue] = useState(initial);
  return <MultiSelect options={OPTIONS} value={value} onChange={setValue} />;
}

describe("MultiSelect", () => {
  describe("absent-column badge styling", () => {
    test("a selected value absent from options renders with amber styling", () => {
      render(<Controlled initial={["pto"]} />);

      const badge = screen.getByText("pto").closest("span");
      expect(badge?.className).toContain("amber");
    });

    test("a selected value present in options renders without amber styling", () => {
      render(<Controlled initial={["gross"]} />);

      const badge = screen.getByText("gross").closest("span");
      expect(badge?.className).not.toContain("amber");
    });
  });

});
