import { test, expect, describe, mock, spyOn, beforeEach, afterEach } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const asFetch = (fn: (...args: Parameters<typeof fetch>) => Promise<Response>): typeof fetch =>
  fn as unknown as typeof fetch;

// Spy on globalThis.fetch so the mock is typed as typeof fetch with tracked calls.
const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
  asFetch((_url, _init) => Promise.reject(new Error("fetch must not be called")))
);

import { SourceFormatterModal } from "@/features/comparisons/components/wizardComponents/SourceFormatterModal";

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(asFetch((_url, _init) => Promise.reject(new Error("fetch must not be called"))));
});

afterEach(() => {
  document.body.innerHTML = "";
});

function okResponse(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(body: object) {
  return new Response(
    `data: ${JSON.stringify({ type: "result", ...body })}\n\n`,
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

function getInputValue(labelPattern: RegExp): string {
  const el = screen.getByLabelText(labelPattern);
  if (!(el instanceof HTMLInputElement)) throw new Error(`Expected HTMLInputElement for ${labelPattern}`);
  return el.value;
}

describe("SourceFormatterModal context form", () => {
  test("shows file input and provider field without calling fetch", () => {
    render(
      <SourceFormatterModal
        open={true}
        onClose={() => {}}
        onConfirm={async () => {}}
      />
    );

    expect(screen.getByLabelText(/file/i)).toBeTruthy();
    expect(screen.getByLabelText(/provider/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("Format button is disabled until both file and provider are filled", () => {
    render(
      <SourceFormatterModal
        open={true}
        onClose={() => {}}
        onConfirm={async () => {}}
      />
    );

    const formatBtn = screen.getByRole("button", { name: /^format$/i });

    // Both empty — disabled
    expect(formatBtn.hasAttribute("disabled")).toBe(true);

    // File only — still disabled
    const testFile = new File(["a,b\n1,2"], "payroll.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [testFile] } });
    expect(formatBtn.hasAttribute("disabled")).toBe(true);

    // Provider filled — now enabled
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "ADP" } });
    expect(formatBtn.hasAttribute("disabled")).toBe(false);
  });

  test("submitting the form sends file, provider, employeeCount, and notes to /api/ai-format/source", async () => {
    fetchSpy.mockImplementation(asFetch(async (_url, _init) =>
      sseResponse({ status: "ok", csv: "name\nAlice", headers: ["name"], rows: [{ name: "Alice" }] })
    ));

    render(
      <SourceFormatterModal
        open={true}
        onClose={() => {}}
        onConfirm={async () => {}}
      />
    );

    const testFile = new File(["name,amount\nAlice,100"], "payroll.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [testFile] } });
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "ADP" } });
    fireEvent.change(screen.getByLabelText(/employee count/i), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: "Extra columns at the end" } });

    fireEvent.click(screen.getByRole("button", { name: /^format$/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    const [fetchedUrl, fetchedInit] = fetchSpy.mock.calls[0];
    expect(String(fetchedUrl)).toBe("/api/ai-format/source");
    expect(fetchedInit?.method).toBe("POST");

    const body = fetchedInit?.body;
    if (!(body instanceof FormData)) throw new Error("Expected FormData body");
    expect(body.get("provider")).toBe("ADP");
    expect(body.get("employeeCount")).toBe("5");
    expect(body.get("notes")).toBe("Extra columns at the end");
    expect(body.get("file")).toBeInstanceOf(File);
  });

  test("Cancel from context screen calls onClose without fetching", () => {
    const onClose = mock(() => {});

    render(
      <SourceFormatterModal
        open={true}
        onClose={onClose}
        onConfirm={async () => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("context fields are included in refine calls", async () => {
    fetchSpy
      .mockImplementationOnce(asFetch(async (_url, _init) =>
        sseResponse({ status: "ok", csv: "name\nAlice", headers: ["name"], rows: [{ name: "Alice" }] })
      ))
      .mockImplementationOnce(asFetch(async (_url, _init) =>
        okResponse({ status: "ok", csv: "name\nAlice B", headers: ["name"], rows: [{ name: "Alice B" }] })
      ));

    render(
      <SourceFormatterModal
        open={true}
        onClose={() => {}}
        onConfirm={async () => {}}
      />
    );

    const testFile = new File(["name\nAlice"], "payroll.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [testFile] } });
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "Paychex" } });
    fireEvent.change(screen.getByLabelText(/employee count/i), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /^format$/i }));

    await waitFor(() => screen.getByPlaceholderText(/give an instruction/i));

    fireEvent.change(screen.getByPlaceholderText(/give an instruction/i), { target: { value: "Fix names" } });
    fireEvent.click(screen.getByRole("button", { name: /^refine$/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    const [refineUrl, refineInit] = fetchSpy.mock.calls[1];
    expect(String(refineUrl)).toBe("/api/ai-format/refine");
    const refinePayload = JSON.parse(String(refineInit?.body));
    expect(refinePayload.provider).toBe("Paychex");
    expect(refinePayload.employeeCount).toBe(10);
    expect(refinePayload.instructions).toBe("Fix names");
  });

  test("initialProvider seeds the provider field on mount", () => {
    render(
      <SourceFormatterModal
        open={true}
        onClose={() => {}}
        onConfirm={async () => {}}
        initialProvider="ADP"
      />
    );
    expect(getInputValue(/provider/i)).toBe("ADP");
  });

  test("initialEmployeeCount and initialNotes seed their fields on mount", () => {
    render(
      <SourceFormatterModal
        open={true}
        onClose={() => {}}
        onConfirm={async () => {}}
        initialEmployeeCount="42"
        initialNotes="Summary rows at page breaks"
      />
    );
    expect(getInputValue(/employee count/i)).toBe("42");
    const notesEl = screen.getByLabelText(/notes/i) as HTMLElement & { value: string };
    expect(notesEl.value).toBe("Summary rows at page breaks");
  });

  test("onConfirm receives provider, employeeCount, and notes alongside csv and filename", async () => {
    fetchSpy.mockImplementation(asFetch(async () =>
      sseResponse({ status: "ok", csv: "name\nAlice", headers: ["name"], rows: [{ name: "Alice" }] })
    ));

    const confirmArgs: unknown[] = [];
    render(
      <SourceFormatterModal
        open={true}
        onClose={() => {}}
        onConfirm={async (...args) => { confirmArgs.push(args); }}
        initialProvider="Paychex"
        initialEmployeeCount="10"
        initialNotes="Extra header row"
      />
    );

    const testFile = new File(["name\nAlice"], "payroll.csv", { type: "text/csv" });
    fireEvent.change(document.getElementById("formatter-file") as HTMLInputElement, { target: { files: [testFile] } });
    fireEvent.click(screen.getByRole("button", { name: /^format$/i }));

    await waitFor(() => screen.getByRole("button", { name: /use this data/i }));
    fireEvent.click(screen.getByRole("button", { name: /use this data/i }));

    await waitFor(() => confirmArgs.length > 0);
    const [csv, filename, context] = confirmArgs[0] as [string, string, { provider: string; employeeCount?: number; notes?: string }];
    expect(csv).toBe("name\nAlice");
    expect(filename).toBe("payroll.csv");
    expect(context.provider).toBe("Paychex");
    expect(context.employeeCount).toBe(10);
    expect(context.notes).toBe("Extra header row");
  });

  test("closing and reopening resets the context form", () => {
    const onClose = mock(() => {});
    const { rerender } = render(
      <SourceFormatterModal open={true} onClose={onClose} onConfirm={async () => {}} />
    );

    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "ADP" } });
    expect(getInputValue(/provider/i)).toBe("ADP");

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    rerender(<SourceFormatterModal open={true} onClose={onClose} onConfirm={async () => {}} />);

    expect(getInputValue(/provider/i)).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// Helper: render the modal, fill context, click Format, wait for preview/flags
async function submitContextForm(fetchResponse: object) {
  fetchSpy.mockImplementation(asFetch(async (_url, _init) => sseResponse(fetchResponse)));

  render(<SourceFormatterModal open={true} onClose={() => {}} onConfirm={async () => {}} />);

  const testFile = new File(["name\nAlice"], "payroll.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [testFile] } });
  fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "ADP" } });
  fireEvent.click(screen.getByRole("button", { name: /^format$/i }));

  // Wait until the refinement input appears (only present in preview/flag state)
  await waitFor(() => screen.getByPlaceholderText(/give an instruction/i));
}

describe("SourceFormatterModal flag display", () => {
  test("flag response from format shows CSV preview alongside flag messages", async () => {
    // tracer bullet
    await submitContextForm({
      status: "flag",
      csv: "name\nAlice",
      flags: ["Row count mismatch: expected 10, got 1", "Column 'SSN' looks sensitive"],
      headers: ["name"],
      rows: [{ name: "Alice" }],
    });

    // Flag messages visible
    expect(screen.getByText("Row count mismatch: expected 10, got 1")).toBeTruthy();
    expect(screen.getByText("Column 'SSN' looks sensitive")).toBeTruthy();

    // CSV preview also visible
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  test("Use this data button is enabled when format returns flag", async () => {
    await submitContextForm({
      status: "flag",
      csv: "name\nAlice",
      flags: ["Something looks off"],
      headers: ["name"],
      rows: [{ name: "Alice" }],
    });

    expect(screen.getByRole("button", { name: /use this data/i }).hasAttribute("disabled")).toBe(false);
  });

  test("refinement input is enabled when format returns flag", async () => {
    await submitContextForm({
      status: "flag",
      csv: "name\nAlice",
      flags: ["Something looks off"],
      headers: ["name"],
      rows: [{ name: "Alice" }],
    });

    expect(screen.getByPlaceholderText(/give an instruction/i).hasAttribute("disabled")).toBe(false);
  });

  test("flag response from refine replaces previous flag messages", async () => {
    fetchSpy
      .mockImplementationOnce(asFetch(async (_url, _init) =>
        sseResponse({ status: "flag", csv: "name\nAlice", flags: ["Initial warning"], headers: ["name"], rows: [{ name: "Alice" }] })
      ))
      .mockImplementationOnce(asFetch(async (_url, _init) =>
        okResponse({ status: "flag", csv: "name\nAlice B", flags: ["New warning from refine"], headers: ["name"], rows: [{ name: "Alice B" }] })
      ));

    render(<SourceFormatterModal open={true} onClose={() => {}} onConfirm={async () => {}} />);

    const testFile = new File(["name\nAlice"], "payroll.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [testFile] } });
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "ADP" } });
    fireEvent.click(screen.getByRole("button", { name: /^format$/i }));
    await waitFor(() => screen.getByText("Initial warning"));

    fireEvent.change(screen.getByPlaceholderText(/give an instruction/i), { target: { value: "Fix it" } });
    fireEvent.click(screen.getByRole("button", { name: /^refine$/i }));

    await waitFor(() => screen.getByText("New warning from refine"));
    expect(screen.queryByText("Initial warning")).toBeNull();
  });

  test("ok response from refine clears previously shown flags", async () => {
    fetchSpy
      .mockImplementationOnce(asFetch(async (_url, _init) =>
        sseResponse({ status: "flag", csv: "name\nAlice", flags: ["Something looks off"], headers: ["name"], rows: [{ name: "Alice" }] })
      ))
      .mockImplementationOnce(asFetch(async (_url, _init) =>
        okResponse({ status: "ok", csv: "name\nAlice", headers: ["name"], rows: [{ name: "Alice" }] })
      ));

    render(<SourceFormatterModal open={true} onClose={() => {}} onConfirm={async () => {}} />);

    const testFile = new File(["name\nAlice"], "payroll.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [testFile] } });
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "ADP" } });
    fireEvent.click(screen.getByRole("button", { name: /^format$/i }));
    await waitFor(() => screen.getByText("Something looks off"));

    fireEvent.change(screen.getByPlaceholderText(/give an instruction/i), { target: { value: "Fix it" } });
    fireEvent.click(screen.getByRole("button", { name: /^refine$/i }));

    // After a successful refine the chat log shows the instruction — wait for that,
    // then confirm the flag section is gone
    await waitFor(() => screen.getByText("Fix it"));
    expect(screen.queryByText("Something looks off")).toBeNull();
  });
});

describe("SourceFormatterModal needs_input flow", () => {
  test("needs_input response shows Claude's questions without CSV preview", async () => {
    fetchSpy.mockImplementation(asFetch(async (_url, _init) =>
      sseResponse({
        status: "needs_input",
        questions: ["What pay period does this cover?", "Are rows 1-3 summary rows?"],
      })
    ));

    render(<SourceFormatterModal open={true} onClose={() => {}} onConfirm={async () => {}} />);

    const testFile = new File(["name\nAlice"], "payroll.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [testFile] } });
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "ADP" } });
    fireEvent.click(screen.getByRole("button", { name: /^format$/i }));

    await waitFor(() => screen.getByText("What pay period does this cover?"));

    expect(screen.getByText("Are rows 1-3 summary rows?")).toBeTruthy();
    expect(screen.queryByPlaceholderText(/give an instruction/i)).toBeNull();
  });

  test("submitting answers sends file, priorResponse, answers, and FormatContext to /api/ai-format/source", async () => {
    const needsInputBody = { status: "needs_input", questions: ["What pay period?"] };
    const okBody = { status: "ok", csv: "name\nAlice", headers: ["name"], rows: [{ name: "Alice" }] };

    fetchSpy
      .mockImplementationOnce(asFetch(async (_url, _init) => sseResponse(needsInputBody)))
      .mockImplementationOnce(asFetch(async (_url, _init) => sseResponse(okBody)));

    render(<SourceFormatterModal open={true} onClose={() => {}} onConfirm={async () => {}} />);

    const testFile = new File(["name\nAlice"], "payroll.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [testFile] } });
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "Paychex" } });
    fireEvent.change(screen.getByLabelText(/employee count/i), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /^format$/i }));

    await waitFor(() => screen.getByText("What pay period?"));

    fireEvent.change(screen.getByLabelText(/your answers/i), { target: { value: "March 2025, semi-monthly" } });
    fireEvent.click(screen.getByRole("button", { name: /submit answers/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    const [retryUrl, retryInit] = fetchSpy.mock.calls[1];
    expect(String(retryUrl)).toBe("/api/ai-format/source");
    expect(retryInit?.method).toBe("POST");

    const body = retryInit?.body;
    if (!(body instanceof FormData)) throw new Error("Expected FormData body");
    expect(body.get("file")).toBeInstanceOf(File);
    expect(body.get("answers")).toBe("March 2025, semi-monthly");
    expect(body.get("provider")).toBe("Paychex");
    expect(body.get("employeeCount")).toBe("3");

    const priorResponse = body.get("priorResponse");
    if (typeof priorResponse !== "string") throw new Error("Expected priorResponse string");
    expect(JSON.parse(priorResponse)).toEqual(needsInputBody);
  });

  test("successful retry transitions modal to preview state", async () => {
    fetchSpy
      .mockImplementationOnce(asFetch(async (_url, _init) =>
        sseResponse({ status: "needs_input", questions: ["What pay period?"] })
      ))
      .mockImplementationOnce(asFetch(async (_url, _init) =>
        sseResponse({ status: "ok", csv: "name\nAlice", headers: ["name"], rows: [{ name: "Alice" }] })
      ));

    render(<SourceFormatterModal open={true} onClose={() => {}} onConfirm={async () => {}} />);

    const testFile = new File(["name\nAlice"], "payroll.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [testFile] } });
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "ADP" } });
    fireEvent.click(screen.getByRole("button", { name: /^format$/i }));

    await waitFor(() => screen.getByText("What pay period?"));

    fireEvent.change(screen.getByLabelText(/your answers/i), { target: { value: "March 2025" } });
    fireEvent.click(screen.getByRole("button", { name: /submit answers/i }));

    await waitFor(() => screen.getByPlaceholderText(/give an instruction/i));

    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.queryByText("What pay period?")).toBeNull();
  });

  test("failed retry (server error) shows error state", async () => {
    fetchSpy
      .mockImplementationOnce(asFetch(async (_url, _init) =>
        sseResponse({ status: "needs_input", questions: ["What pay period?"] })
      ))
      .mockImplementationOnce(asFetch(async (_url, _init) =>
        new Response(JSON.stringify({ error: "Claude returned needs_input on a retry call" }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        })
      ));

    render(<SourceFormatterModal open={true} onClose={() => {}} onConfirm={async () => {}} />);

    const testFile = new File(["name\nAlice"], "payroll.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [testFile] } });
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "ADP" } });
    fireEvent.click(screen.getByRole("button", { name: /^format$/i }));

    await waitFor(() => screen.getByText("What pay period?"));

    fireEvent.change(screen.getByLabelText(/your answers/i), { target: { value: "March 2025" } });
    fireEvent.click(screen.getByRole("button", { name: /submit answers/i }));

    await waitFor(() => screen.getByText(/claude returned needs_input on a retry call/i));
  });
});
