import { Server, type Connection, type ConnectionContext } from "partyserver";
import type { RoomMessage } from "@/lib/types";

type HexColor = `#${string}`;
type UserMeta = { userId: string; userName: string; color: HexColor; userImage: string | null };

export class RoomServer extends Server {
    users = new Map<string, UserMeta>()
    focusedEntries = new Map<string, number>()
    focusedNotes = new Map<string, number>()

    private broadcastPresence() {
        const byUserId = new Map<string, UserMeta>();
        for (const user of this.users.values()) {
            byUserId.set(user.userId, user);
        }
        const msg: RoomMessage = { type: 'presence', users: Array.from(byUserId.values()) };
        this.broadcast(JSON.stringify(msg))
    }

    private broadcastBlurIfFocused(connection: Connection, map: Map<string, number>, type: 'entry_blur' | 'note_blur') {
        const entryId = map.get(connection.id);
        if (entryId === undefined) return;
        const userId = this.users.get(connection.id)?.userId ?? '';
        const msg: RoomMessage = { type, entryId, userId };
        this.broadcast(JSON.stringify(msg));
        map.delete(connection.id);
    }

    private generateUniqueColor(userId: string): HexColor {
        const existing = Array.from(this.users.values()).find(u => u.userId === userId);
        if (existing) return existing.color;

        const palette: HexColor[] = [
            '#E57373', '#F06292', '#BA68C8', '#7986CB',
            '#64B5F6', '#4DB6AC', '#FFB74D', '#A1887F',
            '#FF8A65', '#90A4AE',
        ];
        const inUse = new Set(
            Array.from(this.users.values())
                .filter(u => u.userId !== userId)
                .map(u => u.color)
        );
        return palette.find(c => !inUse.has(c)) ?? palette[this.users.size % palette.length];
    }

    override async onConnect(connection: Connection, ctx: ConnectionContext) {
        const url = new URL(ctx.request.url);
        const userId = url.searchParams.get('userId') ?? ''
        const userName = url.searchParams.get('userName') ?? '';
        const userImage = url.searchParams.get('userImage');
        const color = this.generateUniqueColor(userId);

        this.users.set(connection.id, { userId, userName, color, userImage })
        this.broadcastPresence();
    }

    override async onMessage(connection: Connection, message: string | ArrayBuffer | ArrayBufferView) {
        if (typeof message === 'string') {
            try {
                const parsed = JSON.parse(message) as RoomMessage;
                if (parsed.type === 'entry_focus') {
                    this.focusedEntries.set(connection.id, parsed.entryId);
                } else if (parsed.type === 'entry_blur') {
                    this.focusedEntries.delete(connection.id);
                } else if (parsed.type === 'note_focus') {
                    this.focusedNotes.set(connection.id, parsed.entryId);
                } else if (parsed.type === 'note_blur') {
                    this.focusedNotes.delete(connection.id);
                }
            } catch {
                // non-JSON message — no focus tracking needed
            }
        }
        this.broadcast(message, [connection.id]);
    }

    override async onClose(connection: Connection) {
        this.broadcastBlurIfFocused(connection, this.focusedEntries, 'entry_blur');
        this.broadcastBlurIfFocused(connection, this.focusedNotes, 'note_blur');
        this.users.delete(connection.id)
        this.broadcastPresence();
    }

    override async onError(connection: Connection, error: Error) {
        this.broadcastBlurIfFocused(connection, this.focusedEntries, 'entry_blur');
        this.broadcastBlurIfFocused(connection, this.focusedNotes, 'note_blur');
        this.users.delete(connection.id);
        this.broadcastPresence();
    }

    override async onRequest(req: Request) {
        if (req.method === 'POST') {
            const message: RoomMessage = JSON.parse(await req.text());
            this.broadcast(JSON.stringify(message));
            return new Response('ok');
        }
        return new Response('method not allowed', { status: 405 })
    }
}