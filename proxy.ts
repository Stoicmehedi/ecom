import { auth } from "@/lib/auth";

// Auth.js v5 `auth()` wrapper. Runs on the Node.js runtime under proxy.ts,
// so importing the Prisma/bcrypt-backed auth config here is safe.
// It only DECODES the JWT session cookie per request; authorize() is NOT
// re-run on every request (only on the sign-in POST), so Prisma is not hit here.
export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isOnLogin = nextUrl.pathname === "/login";

  // Unauthenticated -> send to /login (preserve intended destination).
  if (!isLoggedIn && !isOnLogin) {
    const url = new URL("/login", nextUrl);
    url.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return Response.redirect(url);
  }

  // Already authenticated but sitting on /login -> bounce to home.
  if (isLoggedIn && isOnLogin) {
    return Response.redirect(new URL("/", nextUrl));
  }

  // Otherwise allow through.
});

export const config = {
  // Run on everything EXCEPT the auth API, Next internals, and static files.
  // /login IS matched (handled explicitly above) so authed users get bounced.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
