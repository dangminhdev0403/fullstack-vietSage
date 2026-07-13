import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth";

export const { handlers, auth, signIn, signOut, unstable_update } =
  NextAuth(authOptions);
export const { GET, POST } = handlers;
