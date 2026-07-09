import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: string;
      permissions: string[];
      branchId: string | null;
      branchName: string | null;
    } & DefaultSession["user"];
  }

  // Shape returned from authorize() and passed into jwt({ user }).
  interface User {
    username: string;
    role: string;
    permissions: string[];
    branchId: string | null;
    branchName: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: string;
    permissions: string[];
    branchId: string | null;
    branchName: string | null;
  }
}
