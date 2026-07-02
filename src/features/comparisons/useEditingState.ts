import { useCallback, useRef, useState } from "react";
import type { RoomMessage } from "@/shared/lib/types";

const EDITING_TIMEOUT_MS = 20_000;

export function useEditingState({ currentUserId, _timeoutMs = EDITING_TIMEOUT_MS }: { currentUserId: string; _timeoutMs?: number }) {
  const [editingByEntry, setEditingByEntry] = useState<Map<number, string>>(new Map());
  const [noteEditingByEntry, setNoteEditingByEntry] = useState<Map<number, string>>(new Map());
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const noteTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimeout_ = (entryId: number) => {
    const t = timeoutsRef.current.get(entryId);
    if (t !== undefined) {
      clearTimeout(t);
      timeoutsRef.current.delete(entryId);
    }
  };

  const clearNoteTimeout = (entryId: number) => {
    const t = noteTimeoutsRef.current.get(entryId);
    if (t !== undefined) {
      clearTimeout(t);
      noteTimeoutsRef.current.delete(entryId);
    }
  };

  const handleMessage = useCallback((message: RoomMessage) => {
    if (message.type === "entry_focus") {
      if (message.userId === currentUserId) return;
      clearTimeout_(message.entryId);
      setEditingByEntry((prev) => {
        const next = new Map(prev);
        next.set(message.entryId, message.userId);
        return next;
      });
      const t = setTimeout(() => {
        setEditingByEntry((prev) => {
          const next = new Map(prev);
          next.delete(message.entryId);
          return next;
        });
        timeoutsRef.current.delete(message.entryId);
      }, _timeoutMs);
      timeoutsRef.current.set(message.entryId, t);
    } else if (message.type === "entry_blur") {
      clearTimeout_(message.entryId);
      setEditingByEntry((prev) => {
        if (prev.get(message.entryId) !== message.userId) return prev;
        const next = new Map(prev);
        next.delete(message.entryId);
        return next;
      });
    } else if (message.type === "note_focus") {
      if (message.userId === currentUserId) return;
      clearNoteTimeout(message.entryId);
      setNoteEditingByEntry((prev) => {
        const next = new Map(prev);
        next.set(message.entryId, message.userId);
        return next;
      });
      const t = setTimeout(() => {
        setNoteEditingByEntry((prev) => {
          const next = new Map(prev);
          next.delete(message.entryId);
          return next;
        });
        noteTimeoutsRef.current.delete(message.entryId);
      }, _timeoutMs);
      noteTimeoutsRef.current.set(message.entryId, t);
    } else if (message.type === "note_blur") {
      clearNoteTimeout(message.entryId);
      setNoteEditingByEntry((prev) => {
        if (prev.get(message.entryId) !== message.userId) return prev;
        const next = new Map(prev);
        next.delete(message.entryId);
        return next;
      });
    }
  }, [currentUserId]);

  return { editingByEntry, noteEditingByEntry, handleMessage };
}
