"use client";
import { useMemo, useState } from "react";
import { Check, ListPlus, Pause, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { refresh, useLoad } from "@/lib/refresh";
import { BackfillDialog } from "@/components/backfill-dialog";
import { ObligationForm } from "@/components/obligation-form";
import { PaymentForm } from "@/components/payment-form";
import { ReportLink } from "@/components/report-link";
import { Badge, Button, Card, Empty, Input, Modal } from "@/components/ui";
import { overdueDates } from "@/lib/rentals";
import { CYCLE_LABEL, cn, daysUntil, dueLabel, fmtDate, money, toLocalInput } from "@/lib/utils";
import type { Obligation } from "@/lib/types";

type Tab = "all" | "subscription" | "debt";

export default function ObligacionesPage() {
  const [items, setItems] = useState<Obligation[]>([]);
  const [paid, setPaid] = useState<Record<string, number>>({});
  const [paidCount, setPaidCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [showPaidOff, setShowPaidOff] = useState(false);
  const [form, setForm] = useState<{ open: boolean; item?: Obligation }>({ open: false });
  const [pay, setPay] = useState<Obligation | null>(null);
  const [late, setLate] = useState<Obligation | null>(null);

  useLoad(async () => {
    const sb = createClient();
    const [o, l] = await Promise.all([
      sb.from("obligations").select("*").order("next_due_date"),
      sb.from("payment_logs").select("obligation_id, amount_paid").not("obligation_id", "is", null),
    ]);
    setItems((o.data as Obligation[]) ?? []);
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    (l.data ?? []).forEach((r: { obligation_id: string | null; amount_paid: number }) => {
      if (!r.obligation_id) return;
      sums[r.obligation_id] = (sums[r.obligation_id] ?? 0) + r.amount_paid;
      counts[r.obligation_id] = (counts[r.obligation_id] ?? 0) + 1;
    });
    setPaid(sums);
    setPaidCount(counts);
    setLoading(false);
  });

  const list = useMemo(
    () =>
      items.filter(
        (o) =>
          (tab === "all" || o.type === tab) &&
          (showPaidOff || o.status !== "paid_off") &&
          (!q || `${o.title} ${o.category ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      ),
    [items, tab, q, showPaidOff]
  );

  /** Periodos vencidos desde next_due_date; en deudas con cuotas conocidas no se pasa de las cuotas que faltan. */
  function lateDatesOf(o: Obligation): Date[] {
    if (o.status !== "active") return [];
    const dates = overdueDates(o.next_due_date, o.billing_cycle);
    const nTotal = o.installments_total ?? (o.type === "debt" && o.total_amount && o.installment_amount > 0 ? Math.ceil(o.total_amount / o.installment_amount) : null);
    if (o.type === "debt" && nTotal != null) return dates.slice(0, Math.max(0, nTotal - (paidCount[o.id] ?? 0)));
    return dates;
  }

  async function togglePause(o: Obligation) {
    await createClient().from("obligations").update({ status: o.status === "paused" ? "active" : "paused" }).eq("id", o.id);
    refresh();
  }

  async function remove(o: Obligation) {
    if (!confirm(`¿Eliminar "${o.title}"? Sus pagos en la bitácora se conservan.`)) return;
    await createClient().from("obligations").delete().eq("id", o.id);
    refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Suscripciones y deudas</h1>
        <Button onClick={() => setForm({ open: true })}>
          <Plus className="h-4 w-4" /> Nueva
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-muted p-0.5 text-sm">
          {(
            [
              ["all", "Todas"],
              ["subscription", "Suscripciones"],
              ["debt", "Deudas"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} onClick={() => setTab(v)} className={cn("rounded px-3 py-1 font-medium transition-colors", tab === v ? "bg-card shadow-sm" : "text-muted-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showPaidOff} onChange={(e) => setShowPaidOff(e.target.checked)} />
          Liquidadas
        </label>
      </div>

      {!loading && list.length === 0 && <Empty>No hay obligaciones que mostrar.</Empty>}

      <div className="space-y-2">
        {list.map((o) => {
          const days = daysUntil(o.next_due_date);
          const late = o.status === "active" && days < 0;
          const soon = o.status === "active" && days >= 0 && days <= o.reminder_days_before;
          const done = paid[o.id] ?? 0;
          const pct = o.total_amount ? Math.min(100, (done / o.total_amount) * 100) : 0;
          const nPaid = paidCount[o.id] ?? 0;
          const nTotal =
            o.installments_total ?? (o.total_amount && o.installment_amount > 0 ? Math.ceil(o.total_amount / o.installment_amount) : null);
          const nPct = nTotal ? Math.min(100, (nPaid / nTotal) * 100) : 0;
          return (
            <Card key={o.id} className={cn("p-4", o.status !== "active" && "opacity-70")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{o.title}</p>
                    <Badge>{o.type === "debt" ? "Deuda" : "Suscripción"}</Badge>
                    {o.category && <Badge>{o.category}</Badge>}
                    {o.status === "paused" && <Badge tone="warning">Pausada</Badge>}
                    {o.status === "paid_off" && <Badge tone="success">Liquidada</Badge>}
                  </div>
                  {o.status !== "paid_off" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {CYCLE_LABEL[o.billing_cycle]} · {fmtDate(o.next_due_date)} ·{" "}
                      <span className={cn(late && "font-medium text-danger", soon && "font-medium text-warning")}>{dueLabel(o.next_due_date)}</span>
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-sm font-semibold">{money(o.installment_amount, o.currency)}</p>
              </div>

              {o.type === "debt" && (o.total_amount != null || nTotal != null) && (
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${o.total_amount != null ? pct : nPct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {nTotal != null && (
                      <span className="font-medium text-foreground">
                        Cuota {Math.min(nPaid, nTotal)} de {nTotal}
                        {o.status === "active" && nPaid < nTotal ? ` · faltan ${nTotal - nPaid}` : ""}
                      </span>
                    )}
                    {nTotal != null && o.total_amount != null ? " · " : ""}
                    {o.total_amount != null &&
                      `Pagado ${money(done, o.currency)} de ${money(o.total_amount, o.currency)} · pendiente ${money(Math.max(0, o.total_amount - done), o.currency)}`}
                  </p>
                </div>
              )}

              <div className="mt-3 flex items-center gap-1">
                {o.status === "active" && (
                  <Button size="sm" variant="outline" onClick={() => setPay(o)}>
                    <Check className="h-3.5 w-3.5" /> Pagada
                  </Button>
                )}
                {lateDatesOf(o).length >= 2 && (
                  <Button size="sm" variant="outline" onClick={() => setLate(o)}>
                    <ListPlus className="h-3.5 w-3.5" /> Atrasados ({lateDatesOf(o).length})
                  </Button>
                )}
                <div className="ml-auto flex items-center">
                  <ReportLink tipo="obligacion" id={o.id} />
                  {o.status !== "paid_off" && (
                    <Button size="icon" variant="ghost" onClick={() => togglePause(o)} aria-label={o.status === "paused" ? "Reanudar" : "Pausar"}>
                      {o.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => setForm({ open: true, item: o })} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="danger" onClick={() => remove(o)} aria-label="Eliminar">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={form.open} onClose={() => setForm({ open: false })} title={form.item ? "Editar obligación" : "Nueva obligación"}>
        <ObligationForm key={form.item?.id ?? "new"} initial={form.item} onDone={() => setForm({ open: false })} />
      </Modal>
      {late && (
        <BackfillDialog
          open
          onClose={() => setLate(null)}
          title={`Periodos atrasados · ${late.title}`}
          intro="Marca los pagos que ya hiciste pero no registraste. Cada uno queda en la bitácora con su fecha (puedes ajustarla) y la próxima fecha de pago se recalcula sola."
          initialRows={lateDatesOf(late).map((d, i) => ({
            key: String(i),
            label: `Vencía el ${fmtDate(d)}`,
            date: toLocalInput(d),
            amount: String(late.installment_amount),
            checked: true,
          }))}
          prefixOnly
          submitLabel="Registrar pagos"
          onSubmit={async (items, method) => {
            const sb = createClient();
            // Se registran en orden: cada pago avanza un ciclo la próxima fecha
            for (let i = 0; i < items.length; i++) {
              const { error } = await sb.rpc("register_payment", {
                p_obligation_id: late.id,
                p_amount: items[i].amount,
                p_method: method || null,
                p_paid_at: items[i].date,
                p_note: null,
              });
              if (error) {
                if (i > 0) refresh();
                return `Se registraron ${i} de ${items.length}. Error: ${error.message}. Cierra y vuelve a abrir para ver lo que falta.`;
              }
            }
            return null;
          }}
        />
      )}
      <Modal open={!!pay} onClose={() => setPay(null)} title="Registrar pago">
        {pay && <PaymentForm obligation={pay} onDone={() => setPay(null)} />}
      </Modal>
    </div>
  );
}
