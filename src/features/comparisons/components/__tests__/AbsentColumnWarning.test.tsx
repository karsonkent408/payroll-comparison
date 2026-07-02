import { test, expect, describe } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AbsentColumnWarning } from "@/features/comparisons/components/wizardComponents/MapColumns";

describe("AbsentColumnWarning", () => {
  test("shows absent legacy column name with Legacy label", () => {
    render(<AbsentColumnWarning missingLegacy={["pto"]} missingNew={[]} />);

    expect(screen.getByText(/pto/)).toBeTruthy();
    expect(screen.getByText(/Legacy/)).toBeTruthy();
  });

  test("shows absent new column name with New label", () => {
    render(<AbsentColumnWarning missingLegacy={[]} missingNew={["pto_pay"]} />);

    expect(screen.getByText(/pto_pay/)).toBeTruthy();
    expect(screen.getByText(/New/)).toBeTruthy();
  });

  test("renders nothing when all columns are present", () => {
    const { container } = render(<AbsentColumnWarning missingLegacy={[]} missingNew={[]} />);

    expect(container.firstChild).toBeNull();
  });
});
