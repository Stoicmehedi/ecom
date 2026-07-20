import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { fileUrl } from "@/lib/files";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // The shop's logo brands the sign-in screen too, when one is set. A PK read of
  // the single settings row — the logo is a public shop asset (§28.2), so showing
  // it to a signed-out visitor leaks nothing.
  const shop = await prisma.shopSetting.findUnique({
    where: { id: 1 },
    select: { logoKey: true },
  });
  const logoUrl = fileUrl(shop?.logoKey);

  return (
    <Suspense>
      <LoginForm logoUrl={logoUrl} />
    </Suspense>
  );
}
