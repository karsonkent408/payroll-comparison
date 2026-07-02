import { test, expect, mock, describe, spyOn } from "bun:test";

mock.module("partyserver", () => ({
    Server: class {
        broadcast(_msg: string | ArrayBuffer | ArrayBufferView, _exclude?: string[]) {}
    },
}));

import { RoomServer } from "../roomController";
import type { Connection, ConnectionContext } from "partyserver";

function makeServer() {
    const server = new RoomServer({} as DurableObjectState, {} as Cloudflare.Env);
    spyOn(server, "broadcast");
    return server;
}

function makeConnection(id: string): Connection {
    return { id } as unknown as Connection;
}

function makeCtx(userId: string, userName = "Alice"): ConnectionContext {
    return {
        request: { url: `http://example.com/?userId=${userId}&userName=${encodeURIComponent(userName)}` },
    } as unknown as ConnectionContext;
}

describe("roomController", () => {
  describe("onClose: entry_blur broadcast on connection drop", () => {
    test("broadcasts entry_blur when a connection drops with a focused entry", async () => {
      const server = makeServer();
      const conn = makeConnection("conn1");

      await server.onConnect?.(conn, makeCtx("user-1", "Alice"));
      await server.onMessage?.(conn, JSON.stringify({ type: "entry_focus", entryId: 99, userId: "user-1" }));
      (server.broadcast as ReturnType<typeof mock>).mockClear();

      await server.onClose?.(conn);

      expect(server.broadcast).toHaveBeenCalledWith(
        JSON.stringify({ type: "entry_blur", entryId: 99, userId: "user-1" })
      );
    });

    test("does not broadcast entry_blur on close when the popover was already closed", async () => {
      const server = makeServer();
      const conn = makeConnection("conn1");

      await server.onConnect?.(conn, makeCtx("user-1", "Alice"));
      await server.onMessage?.(conn, JSON.stringify({ type: "entry_focus", entryId: 99, userId: "user-1" }));
      await server.onMessage?.(conn, JSON.stringify({ type: "entry_blur", entryId: 99, userId: "user-1" }));
      (server.broadcast as ReturnType<typeof mock>).mockClear();

      await server.onClose?.(conn);

      const calls = (server.broadcast as ReturnType<typeof mock>).mock.calls;
      const blurCall = calls.find(
        ([msg]) => typeof msg === "string" && msg.includes('"type":"entry_blur"')
      );
      expect(blurCall).toBeUndefined();
    });

    test("replaces first focused entry when a second entry_focus arrives", async () => {
      const server = makeServer();
      const conn = makeConnection("conn1");

      await server.onConnect?.(conn, makeCtx("user-1", "Alice"));
      await server.onMessage?.(conn, JSON.stringify({ type: "entry_focus", entryId: 10, userId: "user-1" }));
      await server.onMessage?.(conn, JSON.stringify({ type: "entry_focus", entryId: 20, userId: "user-1" }));
      (server.broadcast as ReturnType<typeof mock>).mockClear();

      await server.onClose?.(conn);

      expect(server.broadcast).toHaveBeenCalledWith(
        JSON.stringify({ type: "entry_blur", entryId: 20, userId: "user-1" })
      );
      const calls = (server.broadcast as ReturnType<typeof mock>).mock.calls;
      const blurFor10 = calls.find(
        ([msg]) => typeof msg === "string" && msg.includes('"entryId":10')
      );
      expect(blurFor10).toBeUndefined();
    });

    test("still broadcasts presence update on close", async () => {
      const server = makeServer();
      const conn = makeConnection("conn1");

      await server.onConnect?.(conn, makeCtx("user-1", "Alice"));
      (server.broadcast as ReturnType<typeof mock>).mockClear();

      await server.onClose?.(conn);

      const calls = (server.broadcast as ReturnType<typeof mock>).mock.calls;
      const presenceCall = calls.find(
        ([msg]) => typeof msg === "string" && msg.includes('"type":"presence"')
      );
      expect(presenceCall).toBeDefined();
    });
  });

  describe("onError: entry_blur broadcast on error drop", () => {
    test("broadcasts entry_blur when a connection errors out with a focused entry", async () => {
      const server = makeServer();
      const conn = makeConnection("conn1");

      await server.onConnect?.(conn, makeCtx("user-1", "Alice"));
      await server.onMessage?.(conn, JSON.stringify({ type: "entry_focus", entryId: 55, userId: "user-1" }));
      (server.broadcast as ReturnType<typeof mock>).mockClear();

      await server.onError?.(conn, new Error("network drop"));

      expect(server.broadcast).toHaveBeenCalledWith(
        JSON.stringify({ type: "entry_blur", entryId: 55, userId: "user-1" })
      );
    });
  });

  describe("onMessage", () => {
    test("rebroadcasts received message to all connections except the sender", async () => {
      const server = makeServer();
      const sender = makeConnection("conn1");

      await server.onMessage?.(sender, "hello");

      expect(server.broadcast).toHaveBeenCalledWith("hello", ["conn1"]);
    });

    test("does not alter the message content when rebroadcasting", async () => {
      const server = makeServer();
      const sender = makeConnection("conn2");
      const payload = JSON.stringify({ type: "entry_focus", entryId: 42, userId: "u1" });

      await server.onMessage?.(sender, payload);

      expect(server.broadcast).toHaveBeenCalledWith(payload, ["conn2"]);
    });
  });

});
