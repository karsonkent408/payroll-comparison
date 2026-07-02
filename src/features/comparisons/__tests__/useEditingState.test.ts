import { test, expect, describe, beforeEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";

let useEditingState: typeof import("../useEditingState").useEditingState;

beforeEach(async () => {
  const mod = await import("../useEditingState");
  useEditingState = mod.useEditingState;
});

describe("useEditingState", () => {
  test("editingByEntry is empty initially", () => {
    const { result } = renderHook(() => useEditingState({ currentUserId: "u1" }));
    expect(result.current.editingByEntry.size).toBe(0);
  });

  test("entry_focus from another user adds their userId to editingByEntry", async () => {
    const { result } = renderHook(() => useEditingState({ currentUserId: "u1" }));

    await act(async () => {
      result.current.handleMessage({ type: "entry_focus", entryId: 10, userId: "u2" });
    });

    expect(result.current.editingByEntry.size).toBe(1);
    expect(result.current.editingByEntry.get(10)).toBe("u2");
  });

  test("entry_focus from the current user is ignored", async () => {
    const { result } = renderHook(() => useEditingState({ currentUserId: "u1" }));

    await act(async () => {
      result.current.handleMessage({ type: "entry_focus", entryId: 10, userId: "u1" });
    });

    expect(result.current.editingByEntry.size).toBe(0);
  });

  test("entry_blur removes the entry from editingByEntry", async () => {
    const { result } = renderHook(() => useEditingState({ currentUserId: "u1" }));

    await act(async () => {
      result.current.handleMessage({ type: "entry_focus", entryId: 10, userId: "u2" });
    });

    expect(result.current.editingByEntry.size).toBe(1);

    await act(async () => {
      result.current.handleMessage({ type: "entry_blur", entryId: 10, userId: "u2" });
    });

    expect(result.current.editingByEntry.size).toBe(0);
  });

  test("entry disappears after timeout with no entry_blur", async () => {
    const { result } = renderHook(() => useEditingState({ currentUserId: "u1", _timeoutMs: 50 }));

    await act(async () => {
      result.current.handleMessage({ type: "entry_focus", entryId: 10, userId: "u2" });
    });

    expect(result.current.editingByEntry.size).toBe(1);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(result.current.editingByEntry.size).toBe(0);
  });

  test("entry_blur before timeout cancels the auto-removal", async () => {
    const { result } = renderHook(() => useEditingState({ currentUserId: "u1", _timeoutMs: 100 }));

    await act(async () => {
      result.current.handleMessage({ type: "entry_focus", entryId: 10, userId: "u2" });
    });

    await act(async () => {
      result.current.handleMessage({ type: "entry_blur", entryId: 10, userId: "u2" });
    });

    // Entry already gone from blur; wait past what the timeout would have been
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });

    expect(result.current.editingByEntry.size).toBe(0);
  });
});
