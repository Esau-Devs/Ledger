"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { refresh } from "@/lib/refresh";
import { METHODS, fromLocalInput, money, toLocalInput } from "@/lib/utils";
import type { Lent, Repayment } from "@/lib/types";
import { Button, Field, Input } from "./ui";

/** Registrar o editar un abono. "Liquidar total" rellena el saldo pendiente. */
export function RepaymentForm({ lent, repayment, onDone }: { lent: Lent; repayment?: Repayment; onDone: () => void }) {
  const sb = createClient();
  // Saldo pendiente sin contar este abono si se está editando
  const remaining = Math.max(0, lent.amount_lent - lent.amount_returned + (repayment?.amount ?? 0));
  const [amount, setAmount] = useState(repayment ? String(repayment.amount) : "");
  const [receivedAt, setReceivedAt] = useState(toLocalInput(repayment?.received_at));
  const [method, setMethod] = useState(repayment?.method ?? "Efectivo");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const v = Number(amount);
    if (!(v > 0)) return setErr("Monto inválido.");
    if (v > remaining + 0.001) return setErr(`El abono supera el saldo pendiente (${money(remaining)}).`);
    if (!receivedAt) return setErr("Selecciona fecha y hora.");
    setBusy(true);

    const payload = { amount: v, received_at: fromLocalInput(receivedAt), method: method || null };
    const { error } = repayment
      ? await sb.from("lent_repayments").update(payload).eq("id", repayment.id)
      : await sb.from("lent_repayments").insert({ ...payload, lent_id: lent.id });

    setBusy(false);
    if (error) return setErr(error.message);
    refresh();
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        <span className="font-medium">{lent.person_name}</span>
        <span className="text-muted-foreground"> · pendiente {money(remaining)}</span>
      </p>
      <Field label="Monto recibido">
        <div className="flex gap-2">
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          <Button variant="outline" onClick={() => setAmount(remaining.toFixed(2))}>
            Liquidar total
          </Button>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha y hora">
          <Input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
        </Field>
        <Field label="Método">
          <Input list="ledger-methods-rep" value={method} onChange={(e) => setMethod(e.target.value)} />
        </Field>
      </div>
      <datalist id="ledger-methods-rep">
        {METHODS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {err && <p className="text-sm text-danger">{err}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Guardando…" : repayment ? "Guardar cambios" : "Registrar abono"}
      </Button>
    </form>
  );
}
