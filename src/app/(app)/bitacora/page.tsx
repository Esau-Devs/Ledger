"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Pencil, Search, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { refresh, useOnRefresh } from "@/lib/refresh";
import { ImportDialog } from "@/components/import-dialog";
import { LentForm } from "@/components/lent-form";
import { PaymentForm } from "@/components/payment-form";
import { RentalPaymentForm } from "@/components/rental-payment-form";
import { RepaymentForm } from "@/components/repayment-form";
import { Badge, Button, Card, Empty, Input, Modal, Select } from "@/components/ui";
import { METHODS, cn, fmtDay, money, wasEdited } from "@/lib/utils";
import type { LedgerEntry, Lent, PaymentLog, Rental, RentalPayment, Repayment } from "@/lib/types";

type TypeFilter = "all" | "subscription" | "debt" | "suelto" | "prestamo" | "abono" | "alquiler";
type Editing = { kind: LedgerEntry["kind"]; log?: PaymentLog; loan?: Lent; rep?: Repayment; rental?: Rental; rentalPays?: RentalPayment[]; rentalPay?: RentalPayment } | null;

const KIND_LABEL: Record<LedgerEntry["kind"], string> = { pago: "Pago", prestamo: "Préstamo", abono: "Abono", alquiler: "Alquiler" };
const isIn = (k: LedgerEntry["kind"]) => k === "abono" || k === "alquiler";
const SIZES = [25, 50, 100];

/** Quita caracteres que rompen la sintaxis de filtros de PostgREST o actúan como comodines. */
const clean = (s: string) => s.replace(/[,()*%_\\]/g, " ").trim();

export default function BitacoraPage() {
  const [rows, setRows] = useState<LedgerEntry[]>([]);
  const [count, setCount] = useState(0);
  const [totals, setTotals] = useState({ outflow: 0, inflow: 0 });
  const [methods, setMethods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [q, setQ] = useState("");
  const [qd, setQd] = useState(""); // q con debounce
  const [method, setMethod] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [version, setVersion] = useState(0);

  const [editing, setEditing] = useState<Editing>(null);
  const [importOpen, setImportOpen] = useState(false);

  useOnRefresh(() => setVersion((v) => v + 1));

  useEffect(() => {
    const t = setTimeout(() => setQd(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Cualquier cambio de filtro vuelve a la primera página
  useEffect(() => setPage(0), [qd, method, type, from, to, size]);

  useEffect(() => {
    let cancelled = false;
    const sb = createClient();
    const needle = clean(qd);
    const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : null;
    const toIso = to ? new Date(`${to}T23:59:59.999`).toISOString() : null;

    (async () => {
      setLoading(true);
      let qb = sb.from("ledger_entries").select("*", { count: "exact" });
      if (type !== "all") qb = qb.eq("type", type);
      if (method) qb = qb.eq("method", method);
      if (fromIso) qb = qb.gte("occurred_at", fromIso);
      if (toIso) qb = qb.lte("occurred_at", toIso);
      if (needle) qb = qb.or(`title.ilike.%${needle}%,sub.ilike.%${needle}%,note.ilike.%${needle}%,method.ilike.%${needle}%`);

      const [list, tot, mths] = await Promise.all([
        qb.order("occurred_at", { ascending: false }).order("id").range(page * size, page * size + size - 1),
        sb.rpc("ledger_totals", { p_type: type === "all" ? null : type, p_method: method || null, p_from: fromIso, p_to: toIso, p_q: needle || null }),
        sb.from("ledger_entries").select("method").not("method", "is", null).limit(1000),
      ]);
      if (cancelled) return;

      if (list.error) setError(list.error.message);
      else {
        setError("");
        setRows((list.data as LedgerEntry[]) ?? []);
        setCount(list.count ?? 0);
      }
      const t = (tot.data as { outflow: number; inflow: number }[] | null)?.[0];
      setTotals({ outflow: Number(t?.outflow ?? 0), inflow: Number(t?.inflow ?? 0) });
      setMethods([...new Set([...METHODS, ...((mths.data ?? []) as { method: string }[]).map((m) => m.method)])].sort());
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [page, size, qd, method, type, from, to, version]);

  const pages = Math.max(1, Math.ceil(count / size));
  // Si tras borrar/filtrar la página actual queda fuera de rango, retrocede
  useEffect(() => {
    if (!loading && page > 0 && page >= pages) setPage(pages - 1);
  }, [loading, page, pages]);

  const groups = useMemo(() => {
    const m = new Map<string, LedgerEntry[]>();
    rows.forEach((e) => m.set(fmtDay(e.occurred_at), [...(m.get(fmtDay(e.occurred_at)) ?? []), e]));
    return [...m.entries()];
  }, [rows]);

  async function openEdit(e: LedgerEntry) {
    const sb = createClient();
    if (e.kind === "pago") {
      const { data } = await sb.from("payment_logs").select("*").eq("id", e.id).single();
      if (data) setEditing({ kind: "pago", log: data as PaymentLog });
    } else if (e.kind === "prestamo") {
      const { data } = await sb.from("lent_money").select("*").eq("id", e.id).single();
      if (data) setEditing({ kind: "prestamo", loan: data as Lent });
    } else if (e.kind === "alquiler") {
      const { data: rp } = await sb.from("rental_payments").select("*").eq("id", e.id).single();
      if (!rp) return;
      const rid = (rp as RentalPayment).rental_id;
      const [{ data: rental }, { data: all }] = await Promise.all([sb.from("rentals").select("*").eq("id", rid).single(), sb.from("rental_payments").select("*").eq("rental_id", rid)]);
      if (rental) setEditing({ kind: "alquiler", rental: rental as Rental, rentalPays: (all as RentalPayment[]) ?? [], rentalPay: rp as RentalPayment });
    } else {
      const { data: rep } = await sb.from("lent_repayments").select("*").eq("id", e.id).single();
      if (!rep) return;
      const { data: loan } = await sb.from("lent_money").select("*").eq("id", (rep as Repayment).lent_id).single();
      if (loan) setEditing({ kind: "abono", rep: rep as Repayment, loan: loan as Lent });
    }
  }

  async function remove(e: LedgerEntry) {
    const extra = e.kind === "pago" && e.type !== "suelto" ? " Esto no revierte la próxima fecha de pago de la obligación." : "";
    if (!confirm(`¿Eliminar este registro?${extra}`)) return;
    const sb = createClient();
    const table = e.kind === "pago" ? "payment_logs" : e.kind === "prestamo" ? "lent_money" : e.kind === "alquiler" ? "rental_payments" : "lent_repayments";
    await sb.from(table).delete().eq("id", e.id);
    refresh();
  }

  const from1 = count === 0 ? 0 : page * size + 1;
  const to1 = Math.min(count, page * size + rows.length);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Bitácora</h1>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Importar
          </Button>
          <a href="/api/export?format=csv" download>
            <Button variant="ghost" size="sm" tabIndex={-1}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </a>
          <a href="/api/export?format=json" download>
            <Button variant="ghost" size="sm" tabIndex={-1}>
              <Download className="h-3.5 w-3.5" /> JSON
            </Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <div className="relative col-span-2 md:col-span-2">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar persona, concepto, nota…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
          <option value="all">Todos los tipos</option>
          <option value="subscription">Suscripciones</option>
          <option value="debt">Deudas</option>
          <option value="suelto">Pagos sueltos</option>
          <option value="prestamo">Préstamos</option>
          <option value="abono">Abonos recibidos</option>
          <option value="alquiler">Alquileres cobrados</option>
        </Select>
        <Select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Todos los métodos</option>
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta" />
      </div>

      <p className="text-xs text-muted-foreground">
        {count} registros · salidas <span className="font-medium text-foreground">{money(totals.outflow)}</span> · entradas{" "}
        <span className="font-medium text-success">{money(totals.inflow)}</span>
        <span className="hidden sm:inline"> (de todos los resultados, no solo de esta página)</span>
      </p>

      {error && <p className="text-sm text-danger">No se pudo cargar la bitácora: {error}. ¿Ejecutaste supabase/migration-v2.sql?</p>}
      {!loading && !error && rows.length === 0 && <Empty>No hay registros con estos filtros.</Empty>}

      <div className={cn("space-y-4 transition-opacity", loading && rows.length > 0 && "opacity-60")}>
        {groups.map(([day, list]) => (
          <section key={day}>
            <h2 className="mb-1.5 text-xs font-medium text-muted-foreground">{day}</h2>
            <Card className="divide-y divide-border">
              {list.map((e) => (
                <div key={`${e.kind}-${e.id}`} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <Badge>{KIND_LABEL[e.kind]}</Badge>
                      {wasEdited(e.created_at, e.updated_at) && <span className="text-[11px] text-muted-foreground">(Editado)</span>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("es-SV", { timeStyle: "short" }).format(new Date(e.occurred_at))}
                      {e.method ? ` · ${e.method}` : ""}
                      {e.note ? ` · ${e.note}` : ""}
                    </p>
                  </div>
                  <p className={cn("shrink-0 text-sm font-semibold", isIn(e.kind) && "text-success")}>
                    {isIn(e.kind) ? "+" : "−"}
                    {money(Number(e.amount))}
                  </p>
                  <div className="flex shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(e)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="danger" onClick={() => remove(e)} aria-label="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        ))}
      </div>

      {count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {from1}–{to1} de {count}
          </p>
          <div className="flex items-center gap-2">
            <Select className="h-8 w-auto" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Registros por página">
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / pág.
                </option>
              ))}
            </Select>
            <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              {page + 1} / {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)}>
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar ${editing ? KIND_LABEL[editing.kind].toLowerCase() : ""}`}>
        {editing?.kind === "pago" && <PaymentForm key={editing.log!.id} log={editing.log} onDone={() => setEditing(null)} />}
        {editing?.kind === "prestamo" && <LentForm key={editing.loan!.id} initial={editing.loan} onDone={() => setEditing(null)} />}
        {editing?.kind === "alquiler" && <RentalPaymentForm key={editing.rentalPay!.id} rental={editing.rental!} payments={editing.rentalPays ?? []} payment={editing.rentalPay} onDone={() => setEditing(null)} />}
        {editing?.kind === "abono" && <RepaymentForm key={editing.rep!.id} lent={editing.loan!} repayment={editing.rep} onDone={() => setEditing(null)} />}
      </Modal>
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
