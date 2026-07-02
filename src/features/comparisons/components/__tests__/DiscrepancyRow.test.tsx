import { test, expect, describe, beforeEach, mock } from "bun:test";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DiscrepancyRow } from "../DiscrepancyRow";
import type { DiscrepancyEntry } from "@/features/comparisons/types";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const entry: DiscrepancyEntry = {
  id: 1,
  column_entry_id: "10",
  legacy_columns: [],
  new_columns: [],
  category: "Earnings",
  label: "Gross Pay",
  display_order: 0,
  legacy_value: 1000,
  legacy_breakdown: null,
  new_value: 900,
  new_breakdown: null,
  difference: 100,
  tolerance: 0,
  auto_status: "unresolved",
  manual_override: null,
  note: null,
  employee_key: "EMP001",
  employee_name: "John Doe",
};

let fetchMock: ReturnType<typeof mock>;

beforeEach(() => {
  fetchMock = mock(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ ...entry, note: "typed" }) } as Response)
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe("DiscrepancyRow", () => {
  test("PATCH fires after 400ms pause in typing", async () => {
    await act(async () => {
      render(
        <DiscrepancyRow
          comparisonId="42"
          category="Earnings"
          entry={entry}
          noteDraft=""
          onNoteChange={() => {}}
          onPatch={() => {}}
          comparisonStatus="fail"
        />,
        { wrapper }
      );
    });

    const input = screen.getByPlaceholderText("Note…");
    fireEvent.change(input, { target: { value: "typed" } });

    // No PATCH yet
    expect(fetchMock.mock.calls.length).toBe(0);

    // Wait past the 400ms debounce window
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });

    const patchCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes("/mappingEntry/1") && c[1]?.method === "PATCH"
    );
    expect(patchCall).toBeTruthy();
    expect(JSON.parse(String(patchCall![1]?.body ?? ""))).toMatchObject({ note: "typed" });
  });

  test("rapid keystrokes produce only one PATCH per pause", async () => {
    await act(async () => {
      render(
        <DiscrepancyRow
          comparisonId="42"
          category="Earnings"
          entry={entry}
          noteDraft=""
          onNoteChange={() => {}}
          onPatch={() => {}}
          comparisonStatus="fail"
        />,
        { wrapper }
      );
    });

    const input = screen.getByPlaceholderText("Note…");

    // Rapid keystrokes — each one resets the debounce timer
    fireEvent.change(input, { target: { value: "t" } });
    fireEvent.change(input, { target: { value: "ty" } });
    fireEvent.change(input, { target: { value: "typ" } });
    fireEvent.change(input, { target: { value: "type" } });

    // Still within debounce window — no PATCH yet
    expect(fetchMock.mock.calls.length).toBe(0);

    // Wait past the debounce window — exactly one PATCH should fire
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });

    const patchCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes("/mappingEntry/1") && c[1]?.method === "PATCH"
    );
    expect(patchCalls.length).toBe(1);
  });

  test("debounce is cancelled when component unmounts before the delay", async () => {
    let unmount!: () => void;

    await act(async () => {
      const result = render(
        <DiscrepancyRow
          comparisonId="42"
          category="Earnings"
          entry={entry}
          noteDraft=""
          onNoteChange={() => {}}
          onPatch={() => {}}
          comparisonStatus="fail"
        />,
        { wrapper }
      );
      unmount = result.unmount;
    });

    const input = screen.getByPlaceholderText("Note…");
    fireEvent.change(input, { target: { value: "not saved" } });

    // Unmount before debounce fires
    unmount();

    // Wait past the debounce window — no PATCH should fire
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });

    const patchCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes("/mappingEntry/1") && c[1]?.method === "PATCH"
    );
    expect(patchCalls.length).toBe(0);
  });

  describe("editing indicator ring", () => {
    test("renders a colored ring on the Legacy value cell when editingUser is set", async () => {
      await act(async () => {
        render(
          <DiscrepancyRow
            comparisonId="42"
            category="Earnings"
            entry={entry}
            noteDraft=""
            onNoteChange={() => {}}
            onPatch={() => {}}
            comparisonStatus="fail"
            editingUser={{ userId: "u2", color: "#ff0000" }}
          />,
          { wrapper }
        );
      });

      const ring = document.querySelector("[data-editing-ring]");
      expect(ring).toBeTruthy();
      expect((ring as HTMLElement).style.borderColor).toBe("#ff0000");
    });

    test("does not render a ring when editingUser is null", async () => {
      await act(async () => {
        render(
          <DiscrepancyRow
            comparisonId="42"
            category="Earnings"
            entry={entry}
            noteDraft=""
            onNoteChange={() => {}}
            onPatch={() => {}}
            comparisonStatus="fail"
            editingUser={null}
          />,
          { wrapper }
        );
      });

      const ring = document.querySelector("[data-editing-ring]");
      expect(ring).toBeNull();
    });

    test("ring shows editing user's name in tooltip aria-label", async () => {
      const presence = [{ userId: "u2", userName: "Bob Smith", color: "#ff0000" as `#${string}`, userImage: null }];

      await act(async () => {
        render(
          <DiscrepancyRow
            comparisonId="42"
            category="Earnings"
            entry={entry}
            noteDraft=""
            onNoteChange={() => {}}
            onPatch={() => {}}
            comparisonStatus="fail"
            editingUser={{ userId: "u2", color: "#ff0000" }}
            presence={presence}
          />,
          { wrapper }
        );
      });

      const ring = document.querySelector("[data-editing-ring]");
      expect(ring).toBeTruthy();
      expect((ring as HTMLElement).getAttribute("title")).toBe("Bob Smith is editing");
    });
  });
});
