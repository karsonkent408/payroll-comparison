declare global {
  namespace Cloudflare {
    interface Env {
      BETTER_AUTH_SECRET: string;
      URL: string;
      GOOGLE_CLIENT_ID: string;
      GOOGLE_CLIENT_SECRET: string;
    }
  }
}

export {};
