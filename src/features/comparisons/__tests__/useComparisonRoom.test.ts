import { test, expect, mock, describe, beforeAll, beforeEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import type { RoomMessage } from "@/lib/types";

const mockSend = mock((_data: string) => {});
const mockClose = mock(() => {});

let capturedSocket: {
  send: typeof mockSend;
  close: typeof mockClose;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
};

mock.module("partysocket", () => ({
  default: function MockPartySocket() {
    capturedSocket = {
      send: mockSend,
      close: mockClose,
      onopen: null,
      onmessage: null,
      onclose: null,
    };
    return capturedSocket;
  },
}));

mock.module("@tanstack/react-router", () => ({
  useNavigate: () => mock(() => {}),
}));

let useComparisonRoom: typeof import("@/features/comparisons/hooks").useComparisonRoom;
beforeAll(async () => {
  const mod = await import("@/features/comparisons/hooks");
  useComparisonRoom = mod.useComparisonRoom;
});

beforeEach(() => {
  mockSend.mockClear();
});

describe("useComparisonRoom", () => {
  describe("send", () => {
    test("hook exposes a send function", () => {
      const { result } = renderHook(() =>
        useComparisonRoom({ comparisonId: "room-1", userId: "u1", userName: "Alice" })
      );

      expect(typeof result.current.send).toBe("function");
    });

    test("calling send dispatches JSON-encoded message over the socket", async () => {
      const msg: RoomMessage = { type: "entry_focus", entryId: 42, userId: "u1" };

      const { result } = renderHook(() =>
        useComparisonRoom({ comparisonId: "room-1", userId: "u1", userName: "Alice" })
      );

      await act(async () => {
        result.current.send(msg);
      });

      expect(mockSend).toHaveBeenCalledWith(JSON.stringify(msg));
    });
  });
});
