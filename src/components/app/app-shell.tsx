"use client";

import { useState } from "react";
import { Menu, PanelLeft } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";

export function AppShell({
  storeName,
  userName,
  userRole,
  permissions,
  defaultCollapsed = false,
  children,
}: {
  storeName: string;
  userName: string;
  userRole?: string | null;
  permissions: string[];
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c;
      // A year-long cookie so the choice survives a reload; the server reads it
      // on the next navigation to paint the right width immediately.
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"};path=/;max-age=31536000;samesite=lax`;
      return next;
    });
  }

  return (
    <div className="flex min-h-svh w-full">
      {/* Desktop sidebar — slides fully out of the way when hidden, and the
          content beside it reflows to the full width. */}
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden border-sidebar-border transition-[width] duration-300 ease-in-out md:block",
          collapsed ? "w-0 border-r-0" : "w-60 border-r",
        )}
      >
        <div className="sticky top-0 h-svh w-60">
          <SidebarContent permissions={permissions} />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-1.5 border-b bg-background/80 px-3 shadow-[0_1px_0_0_var(--border)] backdrop-blur supports-[backdrop-filter]:bg-background/65 sm:px-4">
          {/* Desktop: hide/show the sidebar. */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
            aria-pressed={!collapsed}
            onClick={toggleSidebar}
          >
            <PanelLeft />
          </Button>

          {/* Mobile: the sidebar as a slide-over. */}
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

          <Separator orientation="vertical" className="mx-1 hidden !h-5 md:block" />

          <PageBreadcrumb />

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border bg-card px-2.5 py-1 shadow-sm sm:flex">
              <span className="size-1.5 rounded-full bg-primary shadow-[0_0_0_2px_var(--primary-glow)]" />
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
