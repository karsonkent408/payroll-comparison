import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient(): Anthropic {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const gatewayId = process.env.CLOUDFLARE_GATEWAY_ID;
  const apiKey = process.env.CLOUDFLARE_AI_TOKEN;

  if (!accountId || !gatewayId || !apiKey) {
    throw new Error("Missing credentials for ai");
  }
  const anthropic = new Anthropic({
    apiKey: apiKey,
    baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/anthropic`,
  });
  return anthropic;
}
