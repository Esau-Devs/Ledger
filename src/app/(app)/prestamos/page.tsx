"use client";
import { Fragment, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, HandCoins, ListPlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { refresh, useLoad } from "@/lib/refresh";
import { BackfillDialog } from "@/components/backfill-dialog";
import { LentForm } from "@/components/lent-form";
import { RentalsSection } from "@/components/rentals-section";
import { RepaymentForm } from "@/components/repayment-form";
import { ReportLink } from "@/components/report-link";
import { Badge, Button, Card, Empty, Input, Modal } from "@/components/ui";
import { cn, daysUntil, fmtDate, fmtDay, money, toLocalInput } from "@/lib/utils";
import type { Lent, Repayment } from "@/lib/types";

type Dialog =
  | { kind: "loan"; item?: Lent }
  | { kind: "repay"; lent: Lent; item?: Repayment }
  | { kind: "multi"; lent: Lent }
  | null;

const STATUS: Record<Lent["status"], { label: string; tone: "muted" | "warning" | "success" }> = {
  pending: { label: "Pendiente", tone: "muted" },
  partial: { label: "Parcial", tone: "warning" },
  settled: { label: "Liquidado", tone: "success" },
};

function LoansSection() {
  const [loans, setLoans] = useState<Lent[]>([]);
  const [reps, setReps] = useState<Repayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showSettled, setShowSettled] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<Dialog>(null);

  useLoad(async () => {
    const sb = createClient();
    const [l, r] = await Promise.all([
      sb.from("lent_money").select("*").order("lent_at", { ascending: false }),
      sb.from("lent_repayments").select("*").order("received_at", { ascending: false }),
    ]);
    setLoans((l.data as Lent[]) ?? []);
    setReps((r.data as Repayment[]) ?? []);
    setLoading(false);
  });

  const list = useMemo(
    () => loans.filter((l) => (showSettled || l.status !== "settled") && (!q || l.person_name.toLowerCase().includes(q.toLowerCase()))),
    [loans, q, showSettled]
  );
  const totalReceivable = loans.filter((l) => l.status !== "settled").reduce((s, l) => s + l.amount_lent - l.amount_returned, 0);

  async function removeLoan(l: Lent) {
    if (!confirm(`¿Eliminar el préstamo a ${l.person_name} y todos sus abonos?`)) return;
    await createClient().from("lent_money").delete().eq("id", l.id);
    refresh();
  }
  async function removeRepayment(r: Repayment) {
    if (!confirm("¿Eliminar este abono? El saldo se recalcula solo.")) return;
    await createClient().from("lent_repayments").delete().eq("id", r.id);
    refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Préstamos otorgados</h1>
          <p className="text-sm text-muted-foreground">Por cobrar: <span className="font-medium text-foreground">{money(totalReceivable)}</span></p>
        </div>
        <Button onClick={() => setDialog({ kind: "loan" })}>
          <Plus className="h-4 w-4" /> Nuevo
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar persona…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showSettled} onChange={(e) => setShowSettled(e.target.checked)} />
          Liquidados
        </label>
      </div>

      {!loading && list.length === 0 && <Empty>No hay préstamos que mostrar.</Empty>}

      <div className="space-y-2">
        {list.map((l) => {
          const remaining = Math.max(0, l.amount_lent - l.amount_returned);
          const pct = Math.min(100, (l.amount_returned / l.amount_lent) * 100);
          const mine = reps.filter((r) => r.lent_id === l.id);
          const overdue = l.status !== "settled" && l.expected_return_date && daysUntil(l.expected_return_date) < 0;
          const expanded = !!open[l.id];
          return (
            <Card key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{l.person_name}</p>
                    <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
                    {overdue && <Badge tone="danger">Vencido</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prestado {fmtDate(l.lent_at)}
                    {l.payment_method ? ` · ${l.payment_method}` : ""}
                    {l.expected_return_date ? ` · devolver ${fmtDay(l.expected_return_date)}` : ""}
                  </p>
                  {l.notes && <p className="mt-1 text-xs text-muted-foreground">{l.notes}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">{money(remaining)}</p>
                  <p className="text-xs text-muted-foreground">de {money(l.amount_lent)}</p>
                </div>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
              </div>

              <div className="mt-3 flex items-center gap-1">
                {l.status !== "settled" && (
                  <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "repay", lent: l })}>
                    <HandCoins className="h-3.5 w-3.5" /> Abono
                  </Button>
                )}
                {l.status !== "settled" && (
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "multi", lent: l })}>
                    <ListPlus className="h-3.5 w-3.5" /> Varios
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setOpen((s) => ({ ...s, [l.id]: !expanded }))}>
                  {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Abonos ({mine.length})
                </Button>
                <div className="ml-auto flex">
                  <ReportLink tipo="prestamo" id={l.id} />
                  <Button size="icon" variant="ghost" onClick={() => setDialog({ kind: "loan", item: l })} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="danger" onClick={() => removeLoan(l)} aria-label="Eliminar">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {expanded && (
                <ul className={cn("mt-2 divide-y divide-border rounded-md border border-border text-sm", mine.length === 0 && "hidden")}>
                  {mine.map((r) => (
                    <Fragment key={r.id}>
                      <li className="flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-success">+{money(r.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtDate(r.received_at)}
                            {r.method ? ` · ${r.method}` : ""}
                            {new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 2000 ? " (Editado)" : ""}
                          </p>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => setDialog({ kind: "repay", lent: l, item: r })} aria-label="Editar abono">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="danger" onClick={() => removeRepayment(r)} aria-label="Eliminar abono">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    </Fragment>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={dialog?.kind === "loan"} onClose={() => setDialog(null)} title={dialog?.kind === "loan" && dialog.item ? "Editar préstamo" : "Nuevo préstamo"}>
        {dialog?.kind === "loan" && <LentForm key={dialog.item?.id ?? "new"} initial={dialog.item} onDone={() => setDialog(null)} />}
      </Modal>
      {dialog?.kind === "multi" && (
        <BackfillDialog
          open
          onClose={() => setDialog(null)}
          title={`Varios abonos · ${dialog.lent.person_name}`}
          intro="Agrega de una vez los abonos que recibiste y no registraste. Cada uno con su fecha y hora real."
          initialRows={[{ key: "n0", label: "Abono 1", date: toLocalInput(), amount: "", checked: true }]}
          allowAdd
          submitLabel="Registrar abonos"
          onSubmit={async (items, method) => {
            const lent = dialog.lent;
            const remaining = Math.max(0, lent.amount_lent - lent.amount_returned);
            const sum = items.reduce((t, i) => t + i.amount, 0);
            if (sum > remaining + 0.005) return `Los abonos suman ${money(sum)} y el saldo pendiente es ${money(remaining)}.`;
            const { error } = await createClient()
              .from("lent_repayments")
              .insert(items.map((i) => ({ lent_id: lent.id, amount: i.amount, received_at: i.date, method: method || null })));
            return error?.message ?? null;
          }}
        />
      )}
      <Modal open={dialog?.kind === "repay"} onClose={() => setDialog(null)} title={dialog?.kind === "repay" && dialog.item ? "Editar abono" : "Registrar abono"}>
        {dialog?.kind === "repay" && <RepaymentForm key={dialog.item?.id ?? "new"} lent={dialog.lent} repayment={dialog.item} onDone={() => setDialog(null)} />}
      </Modal>
    </div>
  );
}

function PrestamosTabs() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "alquileres" ? "alquileres" : "prestamos";
  const go = (t: "prestamos" | "alquileres") => router.replace(t === "alquileres" ? "/prestamos?tab=alquileres" : "/prestamos", { scroll: false });

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-md border border-border bg-muted p-0.5 text-sm">
        {(
          [
            ["prestamos", "Préstamos"],
            ["alquileres", "Alquileres"],
          ] as const
        ).map(([v, label]) => (
          <button key={v} onClick={() => go(v)} className={cn("rounded px-4 py-1 font-medium transition-colors", tab === v ? "bg-card shadow-sm" : "text-muted-foreground")}>
            {label}
          </button>
        ))}
      </div>
      {tab === "alquileres" ? <RentalsSection /> : <LoansSection />}
    </div>
  );
}

export default function PrestamosPage() {
  return (
    <Suspense fallback={null}>
      <PrestamosTabs />
    </Suspense>
  );
}
