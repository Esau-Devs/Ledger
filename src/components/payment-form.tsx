"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { refresh } from "@/lib/refresh";
import { METHODS, fromLocalInput, money, toLocalInput } from "@/lib/utils";
import type { Obligation, PaymentLog } from "@/lib/types";
import { Button, Field, Input, Select, Textarea } from "./ui";

/**
 * Tres modos:
 *  - `obligation`: marcar una suscripción/cuota como pagada (RPC: crea log + recalcula next_due_date)
 *  - `log`: editar un registro histórico de la bitácora
 *  - ninguno: pago rápido (opcionalmente ligado a una obligación de `obligations`)
 */
export function PaymentForm({
  obligations = [],
  obligation,
  log,
  onDone,
}: {
  obligations?: Obligation[];
  obligation?: Obligation;
  log?: PaymentLog;
  onDone: () => void;
}) {
  const sb = createClient();
  const [oid, setOid] = useState(obligation?.id ?? "");
  const [amount, setAmount] = useState(String(log?.amount_paid ?? obligation?.installment_amount ?? ""));
  const [method, setMethod] = useState(log?.payment_method ?? "Tarjeta Débito");
  const [paidAt, setPaidAt] = useState(toLocalInput(log?.paid_at)); // por defecto: ahora, editable
  const [note, setNote] = useState(log?.receipt_note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const target = obligation ?? obligations.find((o) => o.id === oid);

  useEffect(() => {
    if (log || obligation) return;
    const o = obligations.find((x) => x.id === oid);
    if (o) setAmount(String(o.installment_amount));
  }, [oid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const value = Number(amount);
    if (!(value >= 0) || amount === "") return setErr("Ingresa un monto válido.");
    if (!paidAt) return setErr("Selecciona fecha y hora.");
    setBusy(true);

    let error;
    if (log) {
      ({ error } = await sb
        .from("payment_logs")
        .update({
          amount_paid: value,
          payment_method: method || null,
          paid_at: fromLocalInput(paidAt),
          receipt_note: note || null,
        })
        .eq("id", log.id));
    } else if (target) {
      ({ error } = await sb.rpc("register_payment", {
        p_obligation_id: target.id,
        p_amount: value,
        p_method: method || null,
        p_paid_at: fromLocalInput(paidAt),
        p_note: note || null,
      }));
    } else {
      ({ error } = await sb.from("payment_logs").insert({
        amount_paid: value,
        payment_method: method || null,
        paid_at: fromLocalInput(paidAt),
        receipt_note: note || null,
      }));
    }

    setBusy(false);
    if (error) return setErr(error.message);
    refresh();
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!log && !obligation && (
        <Field label="Obligación (opcional)">
          <Select value={oid} onChange={(e) => setOid(e.target.value)}>
            <option value="">Pago suelto (sin obligación)</option>
            {obligations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} · {money(o.installment_amount, o.currency)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {obligation && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-medium">{obligation.title}</span>
          <span className="text-muted-foreground"> · el próximo vencimiento se recalculará solo.</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto">
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Método">
          <Input list="ledger-methods" value={method} onChange={(e) => setMethod(e.target.value)} />
        </Field>
      </div>
      <datalist id="ledger-methods">
        {METHODS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <Field label="Fecha y hora del pago">
        <Input type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
      </Field>
      <Field label="Comprobante / referencia">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nº de transacción, nota…" />
      </Field>

      {err && <p className="text-sm text-danger">{err}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Guardando…" : log ? "Guardar cambios" : obligation ? "Confirmar pago" : "Registrar pago"}
      </Button>
    </form>
  );
}
