import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, adminClient } from "better-auth/client/plugins";
import type { Auth } from "@/server/api/util/auth";
import { emailOTPClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>(), adminClient(), emailOTPClient()],
});
