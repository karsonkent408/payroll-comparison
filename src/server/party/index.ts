import { routePartykitRequest } from "partyserver";

export { RoomServer } from "../api/controllers/roomController";

export default {
    async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
        return (await routePartykitRequest(request, env)) ?? new Response("Not Found", { status: 404 });
    },
} satisfies ExportedHandler<Cloudflare.Env>;
