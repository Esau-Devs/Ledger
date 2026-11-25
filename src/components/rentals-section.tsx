"use client";
import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, ListPlus, Pencil, Play, Plus, Power, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { refresh, useLoad } from "@/lib/refresh";
import { STATUS_LABEL, fmtYmd, periodLabel, rentalPeriods, rentalSummary, todayYmd, type PeriodStatus } from "@/lib/rentals";
import { cn, fmtDate, money, wasEdited } from "@/lib/utils";
import type { Rental, RentalPayment } from "@/lib/types";
import { BackfillDialog } from "./backfill-dialog";
import { RentalForm } from "./rental-form";
import { RentalPaymentForm } from "./rental-payment-form";
import { ReportLink } from "./report-link";
import { Badge, Button, Card, Empty, Modal } from "./ui";

const CYCLE: Record<Rental["billing_cycle"], string> = { monthly: "Mensual", biweekly: "Quincenal", weekly: "Semanal" };
const TONE: Record<PeriodStatus, "muted" | "success" | "warning" | "danger"> = { paid: "success", partial: "warning", due: "warning", overdue: "danger", upcoming: "muted" };

export function RentalsSection() {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [pays, setPays] = useState<RentalPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showEnded, setShowEnded] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [all, setAll] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<{ open: boolean; item?: Rental }>({ open: false });
  const [pay, setPay] = useState<{ rental: Rental; payment?: RentalPayment; period?: number } | null>(null);
  const [late, setLate] = useState<Rental | null>(null);

  useLoad(async () => {
    try {
      const sb = createClient();
      const [r, p] = await Promise.all([fetchAll<Rental>(sb, "rentals", "*", "created_at"), fetchAll<RentalPayment>(sb, "rental_payments", "*", "received_at")]);
      setRentals(r);
      setPays(p);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    }
    setLoading(false);
  });

  const today = todayYmd();
  const data = useMemo(
    () =>
      rentals.map((r) => {
        const mine = pays.filter((p) => p.rental_id === r.id);
        const rows = rentalPeriods(r, mine, today);
        return { r, mine, rows, sum: rentalSummary(rows) };
      }),
    [rentals, pays, today]
  );
  const visible = data.filter((d) => showEnded || d.r.status === "active");
  const totalArrears = data.filter((d) => d.r.status === "active").reduce((s, d) => s + d.sum.arrears, 0);

  async function toggleEnded(r: Rental) {
    const sb = createClient();
    if (r.status === "active") {
      const end = today < r.start_date ? r.start_date : today;
      if (!confirm(`¿Finalizar el alquiler de ${r.item}? Dejará de generar periodos desde hoy; lo pendiente sigue contando.`)) return;
      await sb.from("rentals").update({ status: "ended", end_date: r.end_date && r.end_date < end ? r.end_date : end }).eq("id", r.id);
    } else {
      await sb.from("rentals").update({ status: "active", end_date: null }).eq("id", r.id);
    }
    refresh();
  }
  async function removeRental(r: Rental) {
    if (!confirm(`¿Eliminar el alquiler "${r.item}" de ${r.tenant_name} y todos sus cobros?`)) return;
    await createClient().from("rentals").delete().eq("id", r.id);
    refresh();
  }
  async function removePayment(p: RentalPayment) {
    if (!confirm("¿Eliminar este cobro? El periodo vuelve a quedar pendiente.")) return;
    await createClient().from("rental_payments").delete().eq("id", p.id);
    refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Alquileres</h1>
          <p className="text-sm text-muted-foreground">
            Atrasado: <span className={cn("font-medium", totalArrears > 0 ? "text-danger" : "text-foreground")}>{money(totalArrears)}</span>
          </p>
        </div>
        <Button onClick={() => setForm({ open: true })}>
          <Plus className="h-4 w-4" /> Nuevo
        </Button>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
        Mostrar finalizados
      </label>

      {error && <p className="text-sm text-danger">No se pudieron cargar los alquileres: {error}. ¿Ejecutaste supabase/migration-v3.sql?</p>}
      {!loading && !error && visible.length === 0 && <Empty>Aún no hay alquileres. Crea uno para llevar el control de cada periodo.</Empty>}

      <div className="space-y-2">
        {visible.map(({ r, mine, rows, sum }) => {
          const expanded = !!open[r.id];
          const next = sum.unpaidPast[0]?.index ?? sum.next?.index;
          const list = [...rows].reverse();
          const shown = all[r.id] ? list : list.slice(0, 12);
          return (
            <Card key={r.id} className={cn("p-4", r.status === "ended" && "opacity-70")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">
                      {r.item} · {r.tenant_name}
                    </p>
                    <Badge>{CYCLE[r.billing_cycle]}</Badge>
                    {r.status === "ended" && <Badge tone="warning">Finalizado</Badge>}
                    {sum.arrears > 0 ? <Badge tone="danger">{sum.unpaidPast.length === 1 ? "1 periodo atrasado" : `${sum.unpaidPast.length} periodos atrasados`}</Badge> : r.status === "active" && <Badge tone="success">Al día</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Desde {fmtYmd(r.start_date)}
                    {r.end_date ? ` hasta ${fmtYmd(r.end_date)}` : ""} · {rows.filter((x) => !x.future).length} periodos
                    {r.deposit_amount != null ? ` · depósito ${money(Number(r.deposit_amount), r.currency)}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold">{money(Number(r.rent_amount), r.currency)}</p>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Esperado</dt>
                  <dd className="font-medium">{money(sum.expected, r.currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cobrado</dt>
                  <dd className="font-medium text-success">{money(sum.received, r.currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Atrasado</dt>
                  <dd className={cn("font-medium", sum.arrears > 0 && "text-danger")}>{money(sum.arrears, r.currency)}</dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap items-center gap-1">
                {next != null && (
                  <Button size="sm" variant="outline" onClick={() => setPay({ rental: r, period: next })}>
                    <Check className="h-3.5 w-3.5" /> Cobrar
                  </Button>
                )}
                {sum.unpaidPast.length >= 2 && (
                  <Button size="sm" variant="outline" onClick={() => setLate(r)}>
                    <ListPlus className="h-3.5 w-3.5" /> Atrasados ({sum.unpaidPast.length})
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setOpen((s) => ({ ...s, [r.id]: !expanded }))}>
                  {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Periodos
                </Button>
                <div className="ml-auto flex">
                  <ReportLink tipo="alquiler" id={r.id} />
                  <Button size="icon" variant="ghost" onClick={() => setForm({ open: true, item: r })} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => toggleEnded(r)} aria-label={r.status === "active" ? "Finalizar" : "Reanudar"} title={r.status === "active" ? "Finalizar" : "Reanudar"}>
                    {r.status === "active" ? <Power className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="danger" onClick={() => removeRental(r)} aria-label="Eliminar">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {expanded && (
                <div className="mt-3 space-y-3">
                  <ul className="divide-y divide-border rounded-md border border-border text-sm">
                    {shown.map((p) => (
                      <li key={p.index} className="flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{periodLabel(p)}</p>
                          <p className="text-xs text-muted-foreground">
                            {money(p.paid, r.currency)} de {money(p.due, r.currency)}
                            {p.status === "overdue" ? ` · ${p.daysLate} d de atraso` : ""}
                          </p>
                        </div>
                        <Badge tone={TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                        {p.remaining > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setPay({ rental: r, period: p.index })}>
                            Cobrar
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {list.length > 12 && (
                    <Button size="sm" variant="ghost" onClick={() => setAll((s) => ({ ...s, [r.id]: !all[r.id] }))}>
                      {all[r.id] ? "Ver solo los últimos 12" : `Ver todos (${list.length})`}
                    </Button>
                  )}

                  {mine.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Cobros recibidos</p>
                      <ul className="divide-y divide-border rounded-md border border-border text-sm">
                        {[...mine]
                          .sort((a, b) => +new Date(b.received_at) - +new Date(a.received_at))
                          .map((p) => (
                            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-success">+{money(Number(p.amount), r.currency)}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {fmtDate(p.received_at)} · periodo #{p.period_index + 1}
                                  {p.method ? ` · ${p.method}` : ""}
                                  {wasEdited(p.created_at, p.updated_at) ? " (Editado)" : ""}
                                </p>
                              </div>
                              <Button size="icon" variant="ghost" onClick={() => setPay({ rental: r, payment: p })} aria-label="Editar cobro">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="danger" onClick={() => removePayment(p)} aria-label="Eliminar cobro">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={form.open} onClose={() => setForm({ open: false })} title={form.item ? "Editar alquiler" : "Nuevo alquiler"}>
        <RentalForm key={form.item?.id ?? "new"} initial={form.item} onDone={() => setForm({ open: false })} />
      </Modal>

      <Modal open={!!pay} onClose={() => setPay(null)} title={pay?.payment ? "Editar cobro" : "Registrar cobro"}>
        {pay && (
          <RentalPaymentForm
            key={`${pay.rental.id}-${pay.payment?.id ?? pay.period ?? "n"}`}
            rental={pay.rental}
            payments={pays.filter((p) => p.rental_id === pay.rental.id)}
            payment={pay.payment}
            defaultPeriod={pay.period}
            onDone={() => setPay(null)}
          />
        )}
      </Modal>

      {late && (
        <BackfillDialog
          open
          onClose={() => setLate(null)}
          title={`Periodos atrasados · ${late.tenant_name}`}
          intro="Marca los periodos que ya cobraste pero no registraste. Ajusta la fecha real en que te pagaron y el monto de cada uno."
          initialRows={(data.find((d) => d.r.id === late.id)?.sum.unpaidPast ?? []).map((p) => ({
            key: String(p.index),
            label: periodLabel(p),
            date: `${p.start}T12:00`,
            amount: p.remaining.toFixed(2),
            checked: true,
          }))}
          submitLabel="Registrar cobros"
          onSubmit={async (items, method) => {
            const { error } = await createClient()
              .from("rental_payments")
              .insert(items.map((i) => ({ rental_id: late.id, period_index: Number(i.key), amount: i.amount, received_at: i.date, method: method || null })));
            return error?.message ?? null;
          }}
        />
      )}
    </div>
  );
}
