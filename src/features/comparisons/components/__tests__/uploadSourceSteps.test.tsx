import { test, expect, describe, mock, spyOn, beforeEach, afterEach } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mutable config — individual tests can set these before rendering.
let mockSourcesData: { legacy: { file_name: string; row_count: number; headers: string[]; columnSections: Record<string, string>; legacy_provider: string | null; format_notes: string | null } | null; new: null } | null = null;
let mockComparisonData: { expected_employee_count: number | null } | null = null;

mock.module("@/features/comparisons/query", () => ({
  ComparisonQueries: {
    useComparisonSources: () => ({
      isPending: false,
      isError: false,
      data: mockSourcesData,
      error: null,
    }),
    useComparison: () => ({
      isPending: false,
      isError: false,
      data: mockComparisonData,
      error: null,
    }),
    useLegacySourceRow: () => ({ data: undefined }),
  },
}));

mock.module("@/features/comparisons/mutations", () => ({
  ComparisonMutations: {
    patchMappingEntry: {
      mutationFn: async (input: Record<string, unknown>) => {
        const { id, mappingEntryId, ...body } = input;
        const res = await fetch(`/api/comparisons/${String(id)}/mappingEntry/${String(mappingEntryId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return res.json();
      },
    },
    uploadSource: {
      mutationFn: async () => ({
        id: 1,
        comparison_id: 1,
        type: "legacy",
        file_name: "payroll.csv",
        uploaded_at: "2026-01-01T00:00:00Z",
        headers: ["name"],
        rows: [{ name: "Alice" }],
        row_count: 1,
        detectedTypes: {},
        columnSections: {},
        legacy_provider: null,
        format_notes: null,
      }),
    },
  },
}));

import { UploadNewSource } from "@/features/comparisons/components/wizardComponents/UploadNewSource";
import { UploadLegacySource } from "@/features/comparisons/components/wizardComponents/UploadLegacySource";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
}

describe("UploadLegacySource", () => {
  afterEach(() => {
    mockSourcesData = null;
    mockComparisonData = null;
  });

  test("renders 'Legacy Source' heading", () => {
    render(<UploadLegacySource comparisonId="c1" nextStep={() => {}} onBack={() => {}} />, { wrapper: Wrapper });
    expect(screen.getByText("Legacy Source")).toBeTruthy();
  });

  test("shows 'Format with AI' button", () => {
    render(<UploadLegacySource comparisonId="c1" nextStep={() => {}} onBack={() => {}} />, { wrapper: Wrapper });
    expect(screen.getByText(/format with ai/i)).toBeTruthy();
  });

  test("Next button is disabled when no legacy source uploaded", () => {
    render(<UploadLegacySource comparisonId="c1" nextStep={() => {}} onBack={() => {}} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: /next/i }).hasAttribute("disabled")).toBe(true);
  });

  test("formatter opens with provider and notes pre-filled from persisted legacy source", async () => {
    mockSourcesData = {
      legacy: {
        file_name: "payroll.csv", row_count: 10, headers: ["name"],
        columnSections: {}, legacy_provider: "ADP", format_notes: "Header on row 3",
      },
      new: null,
    };
    mockComparisonData = { expected_employee_count: 47 };

    render(<UploadLegacySource comparisonId="c1" nextStep={() => {}} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(/format with ai/i));

    await waitFor(() => screen.getByRole("button", { name: /^format$/i }));

    const providerEl = screen.getByLabelText(/provider/i) as HTMLInputElement;
    const countEl = screen.getByLabelText(/employee count/i) as HTMLInputElement;
    const notesEl = screen.getByLabelText(/notes/i) as HTMLElement & { value: string };

    expect(providerEl.value).toBe("ADP");
    expect(countEl.value).toBe("47");
    expect(notesEl.value).toBe("Header on row 3");
  });
});

describe("UploadNewSource", () => {
  test("renders 'New Source' heading", () => {
    render(<UploadNewSource comparisonId="c1" nextStep={() => {}} />, { wrapper: Wrapper });
    expect(screen.getByText("New Source")).toBeTruthy();
  });

  test("Next button is disabled when no new source uploaded", () => {
    render(<UploadNewSource comparisonId="c1" nextStep={() => {}} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: /next/i }).hasAttribute("disabled")).toBe(true);
  });

  test("does not show 'Format with AI' button", () => {
    render(<UploadNewSource comparisonId="c1" nextStep={() => {}} />, { wrapper: Wrapper });
    expect(screen.queryByText(/format with ai/i)).toBeNull();
  });
});

describe("UploadLegacySource formatter reopen", () => {
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      ((url: RequestInfo | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/ai-format/source")) {
          const sseBody = `data: ${JSON.stringify({ type: "result", status: "ok", csv: "name\nAlice", headers: ["name"], rows: [{ name: "Alice" }] })}\n\n`;
          return new Response(sseBody, { status: 200, headers: { "Content-Type": "text/event-stream" } });
        }
        if (urlStr.includes("/api/ai-format/refine")) {
          return new Response(
            JSON.stringify({ status: "ok", csv: "name\nAlice", headers: ["name"], rows: [{ name: "Alice" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`));
      }) as unknown as typeof fetch
    );
  });

  afterEach(() => {
    try { cleanup(); } catch { /* Radix portal removeChild race in happy-dom when modal is open at test end */ }
    mockSourcesData = null;
    mockComparisonData = null;
    fetchSpy.mockRestore();
  });

  test("reopening the formatter after a successful AI-format confirm shows the context form, not a confirming spinner", async () => {
    render(<UploadLegacySource comparisonId="c1" nextStep={() => {}} />, { wrapper: Wrapper });

    // Open the SourceFormatterModal
    fireEvent.click(screen.getByText(/format with ai/i));

    // Wait for the dialog to be fully open — the Format button only appears in collecting_context state
    await waitFor(() => screen.getByRole("button", { name: /^format$/i }));

    // Fill out the context form
    const fileInput = document.getElementById("formatter-file") as HTMLInputElement;
    const testFile = new File(["name\nAlice"], "payroll.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "ADP" } });
    fireEvent.click(screen.getByRole("button", { name: /^format$/i }));

    // Wait for preview to appear
    await waitFor(() => screen.getByRole("button", { name: /use this data/i }));

    // Confirm — sets state to "confirming" and fires onConfirm which closes the modal
    fireEvent.click(screen.getByRole("button", { name: /use this data/i }));

    // Wait for the dialog to close
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Reopen the formatter
    fireEvent.click(screen.getByText(/format with ai/i));

    // Should land in a fresh collecting_context view — Format button visible and no confirming spinner
    await waitFor(() => screen.getByRole("button", { name: /^format$/i }));
    expect(screen.queryByText(/saving…/i)).toBeNull();
    expect(screen.getByRole("button", { name: /cancel/i }).hasAttribute("disabled")).toBe(false);
  });
});
