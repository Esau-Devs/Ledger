"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { refresh } from "@/lib/refresh";
import { METHODS, fromLocalInput, money, toLocalInput } from "@/lib/utils";
import { periodLabel, rentalPeriods } from "@/lib/rentals";
import type { Rental, RentalPayment } from "@/lib/types";
import { Button, Field, Input, Select, Textarea } from "./ui";

/** Registrar o editar un cobro de alquiler, asignado a un periodo. */
export function RentalPaymentForm({
  rental,
  payments,
  payment,
  defaultPeriod,
  onDone,
}: {
  rental: Rental;
  payments: RentalPayment[];
  payment?: RentalPayment;
  defaultPeriod?: number;
  onDone: () => void;
}) {
  const sb = createClient();
  // Al editar, el saldo de cada periodo se calcula sin contar el cobro que se edita
  const others = payment ? payments.filter((p) => p.id !== payment.id) : payments;
  const rows = rentalPeriods(rental, others);
  const options = payment ? rows : rows.filter((r) => r.remaining > 0);
  const firstIdx = payment?.period_index ?? defaultPeriod ?? options[0]?.index ?? 0;

  const [idx, setIdx] = useState(firstIdx);
  const remainingOf = (i: number) => rows.find((r) => r.index === i)?.remaining ?? Number(rental.rent_amount);
  const [amount, setAmount] = useState(payment ? String(payment.amount) : remainingOf(firstIdx).toFixed(2));
  const [receivedAt, setReceivedAt] = useState(toLocalInput(payment?.received_at));
  const [method, setMethod] = useState(payment?.method ?? "Efectivo");
  const [note, setNote] = useState(payment?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!payment) setAmount(remainingOf(idx).toFixed(2));
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = rows.find((r) => r.index === idx);
  const over = current && Number(amount) > current.remaining + 0.005;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const v = Number(amount);
    if (!(v > 0)) return setErr("Monto inválido.");
    if (!receivedAt) return setErr("Selecciona fecha y hora.");
    setBusy(true);
    const payload = { period_index: idx, amount: v, received_at: fromLocalInput(receivedAt), method: method || null, note: note || null };
    const { error } = payment
      ? await sb.from("rental_payments").update(payload).eq("id", payment.id)
      : await sb.from("rental_payments").insert({ ...payload, rental_id: rental.id });
    setBusy(false);
    if (error) return setErr(error.message);
    refresh();
    onDone();
  }

  if (!payment && options.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay periodos pendientes de cobro en este alquiler.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        <span className="font-medium">
          {rental.item} · {rental.tenant_name}
        </span>
        <span className="text-muted-foreground"> · renta {money(Number(rental.rent_amount), rental.currency)}</span>
      </p>

      <Field label="Periodo que se cobra">
        <Select value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
          {options.map((r) => (
            <option key={r.index} value={r.index}>
              {periodLabel(r)} · {r.remaining > 0 ? `pendiente ${money(r.remaining, rental.currency)}` : "cobrado"}
            </option>
          ))}
          {payment && !options.some((r) => r.index === payment.period_index) && <option value={payment.period_index}>Periodo #{payment.period_index + 1}</option>}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto recibido">
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Método">
          <Input list="ledger-methods-rent" value={method} onChange={(e) => setMethod(e.target.value)} />
        </Field>
      </div>
      <datalist id="ledger-methods-rent">
        {METHODS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {over && <p className="text-xs text-warning">Es más de lo que falta en este periodo; el excedente no se pasa solo al siguiente.</p>}

      <Field label="Fecha y hora en que lo recibiste">
        <Input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
      </Field>
      <Field label="Nota / referencia">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {err && <p className="text-sm text-danger">{err}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Guardando…" : payment ? "Guardar cambios" : "Registrar cobro"}
      </Button>
    </form>
  );
}
