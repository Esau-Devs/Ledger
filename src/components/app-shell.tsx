"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HandCoins, LayoutDashboard, LogOut, Plus, Repeat, ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";
import { QuickAdd } from "./quick-add";
import { Button } from "./ui";

const NAV = [
  { href: "/", label: "Resumen", icon: LayoutDashboard },
  { href: "/obligaciones", label: "Obligaciones", icon: Repeat },
  { href: "/prestamos", label: "Préstamos", icon: HandCoins },
  { href: "/bitacora", label: "Bitácora", icon: ScrollText },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [quick, setQuick] = useState(false);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh">
      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-border bg-background px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">L</div>
          <span className="text-sm font-semibold">Ledger</span>
        </div>
        <nav className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active(href) ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <Button variant="outline" className="mt-auto w-full" onClick={() => setQuick(true)}>
          <Plus className="h-4 w-4" /> Registro rápido
        </Button>
      </aside>

      <div className="md:pl-56">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur">
          <span className="text-sm font-semibold md:invisible">Ledger</span>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 pb-32 pt-6 md:pb-10">{children}</main>
      </div>

      {/* FAB */}
      <button
        onClick={() => setQuick(true)}
        aria-label="Registro rápido"
        className="fixed right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:hidden"
      >
        <Plus className="h-5 w-5" />
      </button>

      {/* Bottom tab bar móvil */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-background/95 backdrop-blur md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", active(href) ? "text-foreground" : "text-muted-foreground")}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>

      <QuickAdd open={quick} onClose={() => setQuick(false)} />
    </div>
  );
}
