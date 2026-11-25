"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { refresh } from "@/lib/refresh";
import { todayYmd } from "@/lib/rentals";
import type { Rental, RentalCycle } from "@/lib/types";
import { Button, Field, Input, Select, Textarea } from "./ui";

export function RentalForm({ initial, onDone }: { initial?: Rental; onDone: () => void }) {
  const sb = createClient();
  const [tenant, setTenant] = useState(initial?.tenant_name ?? "");
  const [item, setItem] = useState(initial?.item ?? "");
  const [rent, setRent] = useState(initial ? String(initial.rent_amount) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [cycle, setCycle] = useState<RentalCycle>(initial?.billing_cycle ?? "monthly");
  const [start, setStart] = useState(initial?.start_date ?? todayYmd());
  const [end, setEnd] = useState(initial?.end_date ?? "");
  const [deposit, setDeposit] = useState(initial?.deposit_amount != null ? String(initial.deposit_amount) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!tenant.trim()) return setErr("¿Quién alquila?");
    if (!item.trim()) return setErr("¿Qué se alquila?");
    if (!(Number(rent) > 0)) return setErr("Monto de renta inválido.");
    if (!start) return setErr("Selecciona la fecha de inicio.");
    if (end && end < start) return setErr("La fecha de fin no puede ser anterior al inicio.");
    setBusy(true);

    const payload = {
      tenant_name: tenant.trim(),
      item: item.trim(),
      rent_amount: Number(rent),
      currency: currency.trim().toUpperCase().slice(0, 3) || "USD",
      billing_cycle: cycle,
      start_date: start,
      end_date: end || null,
      deposit_amount: deposit !== "" && Number(deposit) >= 0 ? Number(deposit) : null,
      notes: notes.trim() || null,
    };
    const { error } = initial ? await sb.from("rentals").update(payload).eq("id", initial.id) : await sb.from("rentals").insert(payload);

    setBusy(false);
    if (error) return setErr(error.message);
    refresh();
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inquilino">
          <Input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="Nombre" autoFocus />
        </Field>
        <Field label="Qué se alquila">
          <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Apto 2B, cuarto, local…" />
        </Field>
        <Field label="Monto de la renta">
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={rent} onChange={(e) => setRent(e.target.value)} />
        </Field>
        <Field label="Moneda">
          <Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} />
        </Field>
        <Field label="Cada cuánto paga" className="col-span-2">
          <Select value={cycle} onChange={(e) => setCycle(e.target.value as RentalCycle)}>
            <option value="monthly">Mensual</option>
            <option value="biweekly">Quincenal (cada 14 días)</option>
            <option value="weekly">Semanal</option>
          </Select>
        </Field>
        <Field label="Inicio del alquiler">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Fin (opcional)">
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Depósito (opcional)" className="col-span-2">
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </Field>
        <Field label="Notas" className="col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        La renta de cada periodo vence el primer día del periodo. Si el alquiler empezó hace meses, pon la fecha real de inicio: luego puedes registrar los periodos atrasados de una vez.
        {initial && " Cambiar el inicio o el ciclo reasigna los periodos ya cobrados."}
      </p>
      {err && <p className="text-sm text-danger">{err}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Guardando…" : initial ? "Guardar cambios" : "Crear alquiler"}
      </Button>
    </form>
  );
}
