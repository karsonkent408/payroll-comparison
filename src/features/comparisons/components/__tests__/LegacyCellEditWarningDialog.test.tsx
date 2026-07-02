import { test, expect, describe } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { LegacyCellEditWarningDialog } from "../wizardComponents/LegacyCellEditWarningDialog";

describe("LegacyCellEditWarningDialog", () => {
  test("renders a warning about losing cell edits when open", () => {
    render(
      <LegacyCellEditWarningDialog
        open={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByText(/cell edit/i)).toBeTruthy();
  });

  test("clicking confirm calls onConfirm", () => {
    let confirmed = false;
    render(
      <LegacyCellEditWarningDialog
        open={true}
        onConfirm={() => { confirmed = true; }}
        onCancel={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /replace/i }));
    expect(confirmed).toBe(true);
  });

  test("clicking cancel calls onCancel", () => {
    let cancelled = false;
    render(
      <LegacyCellEditWarningDialog
        open={true}
        onConfirm={() => {}}
        onCancel={() => { cancelled = true; }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(cancelled).toBe(true);
  });
});
