"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { refresh } from "@/lib/refresh";
import { CYCLE_LABEL, fromLocalInput, toLocalInput } from "@/lib/utils";
import type { Cycle, ObStatus, ObType, Obligation } from "@/lib/types";
import { Button, Field, Input, Select, Textarea } from "./ui";

export function ObligationForm({ initial, onDone }: { initial?: Obligation; onDone: () => void }) {
  const sb = createClient();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<ObType>(initial?.type ?? "subscription");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [total, setTotal] = useState(initial?.total_amount != null ? String(initial.total_amount) : "");
  const [count, setCount] = useState(initial?.installments_total != null ? String(initial.installments_total) : "");
  const [installment, setInstallment] = useState(initial ? String(initial.installment_amount) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [cycle, setCycle] = useState<Cycle>(initial?.billing_cycle ?? "monthly");
  const [due, setDue] = useState(toLocalInput(initial?.next_due_date));
  const [startedAt, setStartedAt] = useState(initial?.started_at ? toLocalInput(initial.started_at) : "");
  const [remind, setRemind] = useState(String(initial?.reminder_days_before ?? 2));
  const [status, setStatus] = useState<ObStatus>(initial?.status ?? "active");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!title.trim()) return setErr("Escribe un título.");
    if (installment === "" || Number(installment) < 0) return setErr("Monto de cuota inválido.");
    if (!due) return setErr("Selecciona la próxima fecha de pago.");
    setBusy(true);

    const payload = {
      title: title.trim(),
      type,
      category: category.trim() || null,
      total_amount: type === "debt" && total !== "" ? Number(total) : null,
      installments_total: type === "debt" && count !== "" && Number(count) > 0 ? Math.floor(Number(count)) : null,
      installment_amount: Number(installment),
      currency: currency.trim().toUpperCase().slice(0, 3) || "USD",
      billing_cycle: cycle,
      next_due_date: fromLocalInput(due),
      started_at: startedAt ? fromLocalInput(startedAt) : null,
      reminder_days_before: Math.max(0, Number(remind) || 0),
      status,
      notes: notes.trim() || null,
    };

    const { error } = initial
      ? await sb.from("obligations").update(payload).eq("id", initial.id)
      : await sb.from("obligations").insert(payload);

    setBusy(false);
    if (error) return setErr(error.message);
    refresh();
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Título" className="col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Netflix, Préstamo Banco…" autoFocus />
        </Field>
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value as ObType)}>
            <option value="subscription">Suscripción</option>
            <option value="debt">Deuda</option>
          </Select>
        </Field>
        <Field label="Categoría">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Software, Tarjeta…" />
        </Field>
        {type === "debt" && (
          <Field label="Monto total de la deuda" className="col-span-2">
            <Input type="number" inputMode="decimal" step="0.01" min="0" value={total} onChange={(e) => setTotal(e.target.value)} />
          </Field>
        )}
        {type === "debt" && (
          <Field label="Número de cuotas (opcional)" className="col-span-2">
            <Input type="number" inputMode="numeric" min="1" step="1" value={count} onChange={(e) => setCount(e.target.value)} placeholder="Ej: 12" />
          </Field>
        )}
        <Field label={type === "debt" ? "Monto de cada cuota" : "Monto por cobro"}>
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={installment} onChange={(e) => setInstallment(e.target.value)} />
        </Field>
        <Field label="Moneda">
          <Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} />
        </Field>
        <Field label="Ciclo">
          <Select value={cycle} onChange={(e) => setCycle(e.target.value as Cycle)}>
            {(Object.keys(CYCLE_LABEL) as Cycle[]).map((c) => (
              <option key={c} value={c}>
                {CYCLE_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Avisar (días antes)">
          <Input type="number" min="0" value={remind} onChange={(e) => setRemind(e.target.value)} />
        </Field>
        <Field label="Próximo pago (fecha y hora)" className="col-span-2">
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Fecha de inicio (opcional, para el informe)" className="col-span-2">
          <Input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
        </Field>
        {initial && (
          <Field label="Estado" className="col-span-2">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ObStatus)}>
              <option value="active">Activa</option>
              <option value="paused">Pausada</option>
              <option value="paid_off">Liquidada</option>
            </Select>
          </Field>
        )}
        <Field label="Notas" className="col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Guardando…" : initial ? "Guardar cambios" : "Crear"}
      </Button>
    </form>
  );
}
