import { betterAuth } from "better-auth";
import { assignRole } from "./assignRole"
import { admin as adminPlugin } from "better-auth/plugins"
import { ac, admin, implementor, guest  } from './permissions'
import { emailOTP } from "better-auth/plugins"
import { sendOTPEmail } from "@/server/api/services/email"
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { env } from "cloudflare:workers";
import { db } from "@/server/db";

export const GOOGLE_AUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
];

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.URL,
  database: drizzleAdapter(db, {
    provider: 'sqlite'
  }),
  experimental: {
    joins: true
  },
  plugins: [
    emailOTP({
      disableSignUp: true,
      async sendVerificationOTP({ email, otp }) {
        await sendOTPEmail(email, otp);
      },
    }),
    adminPlugin({
      ac,
      roles: {
        admin,
        guest,
        implementor
      },
      defaultRole: "guest",
      adminRoles: ["admin"],
    })
  ],
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },
  socialProviders: {
    google: {
      overrideUserInfoOnSignIn: true,
      prompt: "select_account",
      accessType: "offline",
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      scope: GOOGLE_AUTH_SCOPES,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          if (newUser.emailVerified && !newUser.email.endsWith('@domain.com')) {
            throw new Error('Sign-up is restricted. Contact an administrator to get access.');
          }
          return {
            data: { ...newUser, role: assignRole(newUser.email) },
          };
        },
      },
    },
  },
});

export type Auth = typeof auth;
