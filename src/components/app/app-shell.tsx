"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { SidebarContent } from "./sidebar";
import { UserMenu } from "./user-menu";
import { MposLogo } from "./mpos-logo";
import { PageBreadcrumb } from "./page-breadcrumb";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AppShell({
  storeName,
  userName,
  userRole,
  permissions,
  children,
}: {
  storeName: string;
  userName: string;
  userRole?: string | null;
  permissions: string[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-svh w-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border md:block">
        <div className="sticky top-0 h-svh">
          <SidebarContent permissions={permissions} />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/65 sm:px-4">
          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent permissions={permissions} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="md:hidden">
            <MposLogo showWordmark={false} />
          </div>

          <PageBreadcrumb />

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border bg-card px-2.5 py-1 sm:flex">
              <span className="size-1.5 rounded-full bg-primary" />
              <span className="text-[13px] font-medium">{storeName}</span>
            </div>
            <ThemeToggle />
            <Separator orientation="vertical" className="hidden !h-5 sm:block" />
            <UserMenu name={userName} role={userRole} />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-5">{children}</main>
      </div>
    </div>
  );
}
