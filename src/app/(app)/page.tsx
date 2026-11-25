"use client";
import { useMemo, useState } from "react";
import { CalendarClock, HandCoins, Repeat, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { rentalPeriods, rentalSummary, todayYmd } from "@/lib/rentals";
import { useLoad } from "@/lib/refresh";
import { MonthComparison, type MonthTotals } from "@/components/month-comparison";
import { PaymentsChart } from "@/components/payments-chart";
import { Card, Empty } from "@/components/ui";
import { cn, daysUntil, dueLabel, fmtDate, money, monthKey, monthlyEquivalent } from "@/lib/utils";
import type { Lent, Obligation, PaymentLog, Rental, RentalPayment } from "@/lib/types";

function Kpi({ icon: Icon, label, value, sub }: { icon: typeof Wallet; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium">{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-2 truncate text-xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

export default function Dashboard() {
  const [obs, setObs] = useState<Obligation[]>([]);
  const [lent, setLent] = useState<Lent[]>([]);
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [rentalPays, setRentalPays] = useState<RentalPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useLoad(async () => {
    const sb = createClient();
    const [o, l, p] = await Promise.all([
      sb.from("obligations").select("*"),
      sb.from("lent_money").select("*"),
      sb.from("payment_logs").select("*, obligations(title,type,category)").order("paid_at", { ascending: false }).limit(2000),
    ]);
    setObs((o.data as Obligation[]) ?? []);
    setLent((l.data as Lent[]) ?? []);
    setLogs((p.data as PaymentLog[]) ?? []);
    try {
      const [r, rp] = await Promise.all([fetchAll<Rental>(sb, "rentals", "*", "created_at"), fetchAll<RentalPayment>(sb, "rental_payments", "*", "received_at")]);
      setRentals(r);
      setRentalPays(rp);
    } catch {
      /* migration-v3 aún no aplicada: el resumen sigue funcionando sin alquileres */
    }
    setLoading(false);
  });

  const k = useMemo(() => {
    const active = obs.filter((o) => o.status === "active");
    const fixed = active.filter((o) => o.type === "subscription").reduce((s, o) => s + monthlyEquivalent(o.installment_amount, o.billing_cycle), 0);

    const paidBy: Record<string, number> = {};
    logs.forEach((x) => x.obligation_id && (paidBy[x.obligation_id] = (paidBy[x.obligation_id] ?? 0) + x.amount_paid));
    const debt = active
      .filter((o) => o.type === "debt" && o.total_amount != null)
      .reduce((s, o) => s + Math.max(0, (o.total_amount ?? 0) - (paidBy[o.id] ?? 0)), 0);

    const loansReceivable = lent.filter((l) => l.status !== "settled").reduce((s, l) => s + (l.amount_lent - l.amount_returned), 0);
    const today = todayYmd();
    const rentArrears = rentals
      .filter((r) => r.status === "active")
      .reduce((s, r) => s + rentalSummary(rentalPeriods(r, rentalPays.filter((p) => p.rental_id === r.id), today)).arrears, 0);
    const receivable = loansReceivable + rentArrears;
    const next = [...active].sort((a, b) => +new Date(a.next_due_date) - +new Date(b.next_due_date))[0];

    // Pagos por mes y por tipo (suscripción / deuda / otros)
    const by: Record<string, MonthTotals> = {};
    logs.forEach((x) => {
      const t = (by[monthKey(x.paid_at)] ??= { sub: 0, debt: 0, other: 0 });
      const kind = x.obligations?.type === "subscription" ? "sub" : x.obligations?.type === "debt" ? "debt" : "other";
      t[kind] += x.amount_paid;
    });
    const zero: MonthTotals = { sub: 0, debt: 0, other: 0 };
    const now = new Date();
    const at = (back: number) => by[monthKey(new Date(now.getFullYear(), now.getMonth() - back, 1))] ?? zero;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const monthName = (back: number, style: "short" | "long") =>
      new Intl.DateTimeFormat("es-SV", { month: style }).format(new Date(now.getFullYear(), now.getMonth() - back, 1)).replace(".", "");

    const chart = Array.from({ length: 6 }, (_, i) => {
      const back = 5 - i;
      const t = at(back);
      return { label: monthName(back, "short"), sub: r2(t.sub), debt: r2(t.debt), other: r2(t.other) };
    });
    const avg = (k: keyof MonthTotals) => (at(1)[k] + at(2)[k] + at(3)[k]) / 3;
    const cmp = {
      current: at(0),
      previous: at(1),
      average: { sub: avg("sub"), debt: avg("debt"), other: avg("other") },
      labels: { current: monthName(0, "long"), previous: monthName(1, "long") },
    };

    return { fixed, debt, receivable, rentArrears, next, chart, cmp };
  }, [obs, lent, logs, rentals, rentalPays]);

  // Línea de tiempo: vencimientos próximos (arriba) y movimientos recientes (abajo)
  const upcoming = useMemo(
    () => obs.filter((o) => o.status === "active").sort((a, b) => +new Date(b.next_due_date) - +new Date(a.next_due_date)).slice(-5),
    [obs]
  );
  const recent = logs.slice(0, 6);

  if (!loading && obs.length === 0 && lent.length === 0 && logs.length === 0) {
    return (
      <Empty>
        Aún no hay datos. Usa el botón <b>+</b> para registrar tu primer pago o préstamo, o crea tu primera suscripción en <b>Obligaciones</b>.
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Resumen</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Repeat} label="Gasto fijo mensual" value={money(k.fixed)} sub="Suscripciones activas" />
        <Kpi icon={Wallet} label="Deuda pendiente" value={money(k.debt)} sub="Deudas con monto total" />
        <Kpi icon={HandCoins} label="Por cobrar" value={money(k.receivable)} sub={k.rentArrears > 0 ? `Incluye ${money(k.rentArrears)} de alquiler atrasado` : "Préstamos activos"} />
        <Kpi
          icon={CalendarClock}
          label="Próximo pago"
          value={k.next ? money(k.next.installment_amount, k.next.currency) : "—"}
          sub={k.next ? `${k.next.title} · ${dueLabel(k.next.next_due_date)}` : "Sin vencimientos"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-3">
          <h2 className="mb-3 text-sm font-medium">Pagos realizados por mes</h2>
          <PaymentsChart data={k.chart} />
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Línea de tiempo</h2>
          <ol className="relative space-y-3 border-l border-border pl-4">
            {upcoming.map((o) => {
              const late = daysUntil(o.next_due_date) < 0;
              return (
                <li key={o.id} className="relative">
                  <span className={cn("absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border border-border bg-card", late && "border-danger bg-danger")} />
                  <p className="truncate text-sm font-medium">{o.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Vence {fmtDate(o.next_due_date)} · <span className={late ? "text-danger" : ""}>{dueLabel(o.next_due_date)}</span> · {money(o.installment_amount, o.currency)}
                  </p>
                </li>
              );
            })}
            {upcoming.length > 0 && recent.length > 0 && <li className="py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Hoy</li>}
            {recent.map((p) => (
              <li key={p.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-success" />
                <p className="truncate text-sm font-medium">{p.obligations?.title ?? p.receipt_note ?? "Pago"}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(p.paid_at)} · {money(p.amount_paid)}
                  {p.payment_method ? ` · ${p.payment_method}` : ""}
                </p>
              </li>
            ))}
            {upcoming.length === 0 && recent.length === 0 && <li className="text-sm text-muted-foreground">Sin movimientos aún.</li>}
          </ol>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">Comparativa con meses anteriores</h2>
        <MonthComparison {...k.cmp} />
      </Card>
    </div>
  );
}
