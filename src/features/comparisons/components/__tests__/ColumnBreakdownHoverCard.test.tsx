import { test, expect, describe } from "bun:test";
import { render, screen, act } from "@testing-library/react";
import { ColumnBreakdownHoverCard } from "../ColumnBreakdownHoverCard";

describe("ColumnBreakdownHoverCard", () => {
  test("renders nothing when breakdown is null", () => {
    const { container } = render(
      <ColumnBreakdownHoverCard breakdown={null} side="Legacy" />
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders nothing when breakdown has one entry", () => {
    const { container } = render(
      <ColumnBreakdownHoverCard breakdown={{ "Gross Pay": 1000 }} side="Legacy" />
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders indicator icon when breakdown has two or more entries", () => {
    render(
      <ColumnBreakdownHoverCard
        breakdown={{ "Gross Pay": 1000, Bonus: 200 }}
        side="Legacy"
      />
    );
    expect(screen.getByRole("button", { name: /legacy breakdown/i })).toBeTruthy();
  });

  test("hover card shows all column names and formatted values when open", async () => {
    await act(async () => {
      render(
        <ColumnBreakdownHoverCard
          breakdown={{ "Gross Pay": 1000, Bonus: 200 }}
          side="Legacy"
          open={true}
        />
      );
    });
    expect(screen.getByText("Gross Pay")).toBeTruthy();
    expect(screen.getByText("Bonus")).toBeTruthy();
    expect(screen.getByText("$1,000.00")).toBeTruthy();
    expect(screen.getByText("$200.00")).toBeTruthy();
  });
});
