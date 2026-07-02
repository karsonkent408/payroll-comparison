import { test, expect, describe, beforeEach, mock } from "bun:test";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CellEditPopover } from "../CellEditPopover";
import type { RoomMessage } from "@/shared/lib/types";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockFetch(response: unknown, ok = true) {
  const m = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve({ ok, json: () => Promise.resolve(response) } as Response)
  );
  globalThis.fetch = m as unknown as typeof fetch;
  return m;
}

beforeEach(() => {
  globalThis.fetch = mock((url: string) => {
    if (String(url).includes("/rows/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ gross: "1000.00", overtime: "200.00" }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ results: [{ legacy_value: 1500, new_value: 1500, difference: 0, auto_status: "resolved" }] }),
    } as Response);
  }) as unknown as typeof fetch;
});

describe("CellEditPopover", () => {
  test("shows each legacy column name with a pre-filled editable input", async () => {
    await act(async () => {
      render(
        <CellEditPopover
          open={true}
          onOpenChange={() => {}}
          comparisonId="1"
          employeeKey="101"
          legacyColumns={["gross", "overtime"]}
          onSaved={() => {}}
        />,
        { wrapper }
      );
    });

    expect(screen.getByText("gross")).toBeTruthy();
    expect(screen.getByText("overtime")).toBeTruthy();
    await waitFor(() => {
      expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("1000.00");
      expect((screen.getAllByRole("textbox")[1] as HTMLInputElement).value).toBe("200.00");
    });
  });

  test("shows a saving state while the PATCH request is in flight", async () => {
    let resolvePatch!: (v: unknown) => void;
    globalThis.fetch = mock((url: string) => {
      if (String(url).includes("/rows/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ gross: "1000.00" }),
        } as Response);
      }
      return new Promise((resolve) => { resolvePatch = resolve; });
    }) as unknown as typeof fetch;

    await act(async () => {
      render(
        <CellEditPopover
          open={true}
          onOpenChange={() => {}}
          comparisonId="1"
          employeeKey="101"
          legacyColumns={["gross"]}
          onSaved={() => {}}
        />,
        { wrapper }
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
    });
    expect(screen.getByRole("button", { name: /saving/i })).toBeTruthy();

    await act(async () => {
      resolvePatch({ ok: true, json: () => Promise.resolve({ results: [] }) });
    });
  });

  test("calls onSaved with updated results when save succeeds", async () => {
    const savedResults: unknown[] = [];

    await act(async () => {
      render(
        <CellEditPopover
          open={true}
          onOpenChange={() => {}}
          comparisonId="1"
          employeeKey="101"
          legacyColumns={["gross"]}
          onSaved={(r) => savedResults.push(...r)}
        />,
        { wrapper }
      );
    });

    await act(async () => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "1500.00" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
    });

    expect(savedResults).toHaveLength(1);
    expect((savedResults[0] as { legacy_value: number }).legacy_value).toBe(1500);
  });

  test("shows inline error and keeps previous values when save fails", async () => {
    globalThis.fetch = mock((url: string) => {
      if (String(url).includes("/rows/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ gross: "1000.00" }),
        } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "Server error" }) } as Response);
    }) as unknown as typeof fetch;

    await act(async () => {
      render(
        <CellEditPopover
          open={true}
          onOpenChange={() => {}}
          comparisonId="1"
          employeeKey="101"
          legacyColumns={["gross"]}
          onSaved={() => {}}
        />,
        { wrapper }
      );
    });

    await waitFor(() => {
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("1000.00");
    });

    await act(async () => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "9999.00" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
    });

    expect(screen.getByText(/failed/i)).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("9999.00");
  });

  test("shows a single Value input when legacyColumns is empty and calls discrepancy PATCH on save", async () => {
    const fetchMock = mockFetch({ legacy_value: 500, new_value: 500, difference: 0, auto_status: "resolved" });

    const savedResults: unknown[] = [];
    await act(async () => {
      render(
        <CellEditPopover
          open={true}
          onOpenChange={() => {}}
          comparisonId="1"
          employeeKey="101"
          legacyColumns={[]}
          discrepancyId={42}
          onSaved={(r) => savedResults.push(...r)}
        />,
        { wrapper }
      );
    });

    expect(screen.getByText("Value")).toBeTruthy();
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "500" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
    });

    const calls = fetchMock.mock.calls;
    const patchCall = calls.find((c) => String(c[0]).includes("/mappingEntry/42"));
    expect(patchCall).toBeTruthy();
    expect(JSON.parse(patchCall![1]?.body as string)).toEqual({ legacy_value: 500 });
    expect(savedResults).toHaveLength(1);
  });

  test("clears values when popover closes so stale values are never shown on reopen", async () => {
    let rerender!: ReturnType<typeof render>["rerender"];

    await act(async () => {
      const result = render(
        <CellEditPopover
          open={true}
          onOpenChange={() => {}}
          comparisonId="1"
          employeeKey="101"
          legacyColumns={["gross"]}
          onSaved={() => {}}
        />,
        { wrapper }
      );
      rerender = result.rerender;
    });

    await waitFor(() => {
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("1000.00");
    });

    await act(async () => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "9999.00" } });
    });
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("9999.00");

    await act(async () => {
      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <CellEditPopover
            open={false}
            onOpenChange={() => {}}
            comparisonId="1"
            employeeKey="101"
            legacyColumns={["gross"]}
            onSaved={() => {}}
          />
        </QueryClientProvider>
      );
    });

    await act(async () => {
      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <CellEditPopover
            open={true}
            onOpenChange={() => {}}
            comparisonId="1"
            employeeKey="101"
            legacyColumns={["gross"]}
            onSaved={() => {}}
          />
        </QueryClientProvider>
      );
    });

    await waitFor(() => {
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("1000.00");
    });
  });

  describe("focus/blur signals", () => {
    test("calls send with entry_focus when open transitions to true", async () => {
      const sendMock = mock((_msg: RoomMessage) => {});
      let rerender!: ReturnType<typeof render>["rerender"];

      await act(async () => {
        const result = render(
          <CellEditPopover
            open={false}
            onOpenChange={() => {}}
            comparisonId="1"
            employeeKey="101"
            legacyColumns={["gross"]}
            onSaved={() => {}}
            send={sendMock}
            userId="u1"
            entryId={99}
          />,
          { wrapper }
        );
        rerender = result.rerender;
      });

      expect(sendMock.mock.calls.length).toBe(0);

      await act(async () => {
        rerender(
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <CellEditPopover
              open={true}
              onOpenChange={() => {}}
              comparisonId="1"
              employeeKey="101"
              legacyColumns={["gross"]}
              onSaved={() => {}}
              send={sendMock}
              userId="u1"
              entryId={99}
            />
          </QueryClientProvider>
        );
      });

      expect(sendMock.mock.calls.length).toBe(1);
      expect(sendMock.mock.calls[0][0]).toEqual({ type: "entry_focus", entryId: 99, userId: "u1" });
    });

    test("calls send with entry_blur when open transitions to false", async () => {
      const sendMock = mock((_msg: RoomMessage) => {});
      let rerender!: ReturnType<typeof render>["rerender"];

      await act(async () => {
        const result = render(
          <CellEditPopover
            open={true}
            onOpenChange={() => {}}
            comparisonId="1"
            employeeKey="101"
            legacyColumns={["gross"]}
            onSaved={() => {}}
            send={sendMock}
            userId="u1"
            entryId={99}
          />,
          { wrapper }
        );
        rerender = result.rerender;
      });

      sendMock.mockClear();

      await act(async () => {
        rerender(
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <CellEditPopover
              open={false}
              onOpenChange={() => {}}
              comparisonId="1"
              employeeKey="101"
              legacyColumns={["gross"]}
              onSaved={() => {}}
              send={sendMock}
              userId="u1"
              entryId={99}
            />
          </QueryClientProvider>
        );
      });

      expect(sendMock.mock.calls.length).toBe(1);
      expect(sendMock.mock.calls[0][0]).toEqual({ type: "entry_blur", entryId: 99, userId: "u1" });
    });
  });
});
