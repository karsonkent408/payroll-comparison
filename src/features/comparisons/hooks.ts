import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomMessage } from "@/shared/lib/types";
import { useNavigate } from "@tanstack/react-router";
import PartySocket from "partysocket";

interface PresenceUser {
  userId: string;
  userName: string;
  color: `#${string}`;
  userImage: string | null;
}

interface UseComparisonRoomOptions {
  comparisonId: string;
  userId: string;
  userName: string;
  userImage?: string | null;
  /** Called on any message — useful for toast notifications, etc. */
  onMessage?: (message: RoomMessage) => void;
}

export function useComparisonRoom({
  comparisonId,
  userId,
  userName,
  userImage,
  onMessage,
}: UseComparisonRoomOptions) {
  const navigate = useNavigate();
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    let unmounted = false;

    const ws = new PartySocket({
      host: import.meta.env?.PARTY_HOST ?? window.location.host,
      room: comparisonId,
      query: { userId, userName, ...(userImage ? { userImage } : {}) },
    });
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted) return;
      setConnected(true);
    };

    ws.onmessage = (event) => {
      if (unmounted) return;
      const message: RoomMessage = JSON.parse(event.data);
      onMessage?.(message);

      if (message.type === "presence") {
        setPresence(message.users);
      } else if (message.type === "deleted") {
        navigate({ to: "/", search: { page: 1, filters: undefined } });
      }
    };

    ws.onclose = () => {
      if (unmounted) return;
      setConnected(false);
      setPresence([]);
    };

    return () => {
      unmounted = true;
      wsRef.current = null;
      ws.close();
    };
  }, [comparisonId, userId, userName]);

  const send = useCallback((message: RoomMessage) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  return { presence, connected, send };
}
