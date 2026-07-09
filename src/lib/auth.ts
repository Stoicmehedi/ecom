import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const username = credentials?.username;
        const password = credentials?.password;
        if (typeof username !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username },
          include: { role: true, branch: true },
        });

        // Return null on any failure -> Auth.js raises CredentialsSignin.
        if (!user || !user.isActive) return null;

        const passwordOk = await bcrypt.compare(password, user.passwordHash);
        if (!passwordOk) return null;

        // Shape returned here flows into the jwt() callback as `user`.
        // User.id / branchId are Int in the schema -> stringify for Auth.js.
        return {
          id: String(user.id),
          name: user.name,
          username: user.username,
          role: user.role?.name ?? "",
          permissions: user.role?.permissions ?? [],
          branchId: user.branchId != null ? String(user.branchId) : null,
          branchName: user.branch?.name ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only defined on initial sign-in.
      if (user) {
        token.id = user.id!;
        token.username = user.username;
        token.role = user.role;
        token.permissions = user.permissions;
        token.branchId = user.branchId;
        token.branchName = user.branchName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.role = token.role;
        session.user.permissions = token.permissions ?? [];
        session.user.branchId = token.branchId ?? null;
        session.user.branchName = token.branchName ?? null;
      }
      return session;
    },
  },
});
