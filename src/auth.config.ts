import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe subset of the auth config - no adapter/db import here, since
// pg's Node.js driver can't run in the Edge runtime that middleware uses.
// See src/auth.ts for the full config (adapter included) used everywhere
// else (route handlers, server components/actions).
export const authConfig: NextAuthConfig = {
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    // Auth.js's default session callback only copies name/email/image onto
    // session.user, dropping the id (token.sub) - every route that scopes
    // data by session.user.id needs this to not be undefined.
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
