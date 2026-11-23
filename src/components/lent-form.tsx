"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { refresh } from "@/lib/refresh";
import { METHODS, fromLocalInput, toLocalInput } from "@/lib/utils";
import type { Lent } from "@/lib/types";
import { Button, Field, Input, Textarea } from "./ui";

export function LentForm({ initial, onDone }: { initial?: Lent; onDone: () => void }) {
  const sb = createClient();
  const [person, setPerson] = useState(initial?.person_name ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount_lent) : "");
  const [lentAt, setLentAt] = useState(toLocalInput(initial?.lent_at)); // ahora por defecto, editable
  const [expected, setExpected] = useState(initial?.expected_return_date ? toLocalInput(initial.expected_return_date) : "");
  const [method, setMethod] = useState(initial?.payment_method ?? "Efectivo");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!person.trim()) return setErr("¿A quién le prestaste?");
    if (!(Number(amount) > 0)) return setErr("Monto inválido.");
    if (!lentAt) return setErr("Selecciona fecha y hora.");
    setBusy(true);

    const payload = {
      person_name: person.trim(),
      amount_lent: Number(amount),
      lent_at: fromLocalInput(lentAt),
      expected_return_date: expected ? fromLocalInput(expected) : null,
      payment_method: method || null,
      notes: notes.trim() || null,
    };
    const { error } = initial
      ? await sb.from("lent_money").update(payload).eq("id", initial.id)
      : await sb.from("lent_money").insert(payload);

    setBusy(false);
    if (error) return setErr(error.message);
    refresh();
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Persona">
        <Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Nombre" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto prestado">
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Cómo se entregó">
          <Input list="ledger-methods-lent" value={method} onChange={(e) => setMethod(e.target.value)} />
        </Field>
      </div>
      <datalist id="ledger-methods-lent">
        {METHODS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <Field label="Fecha y hora del préstamo">
        <Input type="datetime-local" value={lentAt} onChange={(e) => setLentAt(e.target.value)} />
      </Field>
      <Field label="Devolución esperada (opcional)">
        <Input type="datetime-local" value={expected} onChange={(e) => setExpected(e.target.value)} />
      </Field>
      <Field label="Notas">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <p className="text-sm text-danger">{err}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Guardando…" : initial ? "Guardar cambios" : "Registrar préstamo"}
      </Button>
    </form>
  );
}
