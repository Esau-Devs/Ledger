"use client";
import { useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, HandCoins } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLoad } from "@/lib/refresh";
import { cn, daysUntil, dueLabel, money } from "@/lib/utils";
import type { Lent, Obligation } from "@/lib/types";
import { Button } from "./ui";

interface Item {
  key: string;
  title: string;
  detail: string;
  days: number;
  href: string;
  kind: "pago" | "cobro";
}

export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);

  useLoad(async () => {
    const sb = createClient();
    const [o, l] = await Promise.all([
      sb.from("obligations").select("*").eq("status", "active"),
      sb.from("lent_money").select("*").neq("status", "settled").not("expected_return_date", "is", null),
    ]);

    const out: Item[] = [];
    for (const ob of (o.data as Obligation[]) ?? []) {
      const days = daysUntil(ob.next_due_date);
      if (days <= ob.reminder_days_before) {
        out.push({ key: `o-${ob.id}`, title: ob.title, detail: money(ob.installment_amount, ob.currency), days, href: "/obligaciones", kind: "pago" });
      }
    }
    for (const ln of (l.data as Lent[]) ?? []) {
      const days = daysUntil(ln.expected_return_date!);
      if (days <= 3) {
        out.push({
          key: `l-${ln.id}`,
          title: `Cobrar a ${ln.person_name}`,
          detail: money(ln.amount_lent - ln.amount_returned),
          days,
          href: "/prestamos",
          kind: "cobro",
        });
      }
    }
    setItems(out.sort((a, b) => a.days - b.days));
  });

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label="Notificaciones" className="relative">
        <Bell className="h-4 w-4" />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">
            {items.length}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">Notificaciones</div>
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Todo al día ✓</p>
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {items.map((i) => (
                  <li key={i.key}>
                    <Link href={i.href} onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted">
                      {i.kind === "pago" ? <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" /> : <HandCoins className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{i.title}</p>
                        <p className="text-xs text-muted-foreground">{i.detail}</p>
                      </div>
                      <span className={cn("text-xs font-medium", i.days < 0 ? "text-danger" : i.days === 0 ? "text-warning" : "text-muted-foreground")}>
                        {dueLabel(new Date(Date.now() + i.days * 86400000))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
