import { getServerByName } from 'partyserver'
import type { RoomMessage } from '@/lib/types'

export async function broadcastToRoom(
    env: Cloudflare.Env,
    comparisonId: string,
    message: RoomMessage,
) {
    const stub = await getServerByName(env.Main, comparisonId)
    return stub.fetch(`https://internal/parties/main/${comparisonId}`, {
        method: 'POST',
        body: JSON.stringify(message),
    })
}
