"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { refresh } from "@/lib/refresh";
import { METHODS, fromLocalInput, money, toLocalInput } from "@/lib/utils";
import { Button, Input, Modal } from "./ui";

export interface BackfillRow {
  key: string;
  label: string;
  date: string; // valor de datetime-local
  amount: string;
  checked: boolean;
}
export interface BackfillItem {
  key: string;
  label: string;
  date: string; // ISO
  amount: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  intro: string;
  initialRows: BackfillRow[];
  /** Permite añadir filas a mano (p. ej. abonos de un préstamo). */
  allowAdd?: boolean;
  /** Solo se pueden marcar los primeros N (los periodos deben registrarse en orden). */
  prefixOnly?: boolean;
  methodDefault?: string;
  submitLabel: string;
  /** Devuelve un mensaje de error, o null si todo salió bien. */
  onSubmit: (items: BackfillItem[], method: string) => Promise<string | null>;
}

export function BackfillDialog({ open, onClose, title, ...rest }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <Inner onClose={onClose} {...rest} />
    </Modal>
  );
}

function Inner({ onClose, intro, initialRows, allowAdd, prefixOnly, methodDefault = "Efectivo", submitLabel, onSubmit }: Omit<Props, "open" | "title">) {
  const [rows, setRows] = useState<BackfillRow[]>(initialRows);
  const [method, setMethod] = useState(methodDefault);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const patch = (i: number, p: Partial<BackfillRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  function toggle(i: number, on: boolean) {
    if (prefixOnly) setRows((rs) => rs.map((r, j) => ({ ...r, checked: on ? j <= i : j < i })));
    else patch(i, { checked: on });
  }

  const selected = rows.filter((r) => r.checked);
  const total = selected.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  async function submit() {
    setErr("");
    if (selected.length === 0) return setErr("Marca al menos una fila.");
    const items: BackfillItem[] = [];
    for (const r of selected) {
      const amount = Number(r.amount);
      if (!(amount > 0)) return setErr(`Monto inválido en «${r.label}».`);
      if (!r.date || Number.isNaN(+new Date(r.date))) return setErr(`Fecha inválida en «${r.label}».`);
      items.push({ key: r.key, label: r.label, date: fromLocalInput(r.date), amount });
    }
    setBusy(true);
    const e = await onSubmit(items, method);
    setBusy(false);
    if (e) return setErr(e);
    refresh();
    onClose();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{intro}</p>

      {rows.length === 0 && !allowAdd && <p className="rounded-md bg-muted px-3 py-4 text-center text-sm text-muted-foreground">No hay periodos atrasados por registrar.</p>}

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-md border border-border p-2.5">
            <div className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={r.checked} onChange={(e) => toggle(i, e.target.checked)} aria-label={`Incluir ${r.label}`} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.label}</span>
              {allowAdd && rows.length > 1 && (
                <Button size="icon" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Quitar fila">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]">
              <Input type="datetime-local" value={r.date} disabled={!r.checked} onChange={(e) => patch(i, { date: e.target.value })} aria-label="Fecha y hora" />
              <Input type="number" inputMode="decimal" step="0.01" min="0" placeholder="Monto" value={r.amount} disabled={!r.checked} onChange={(e) => patch(i, { amount: e.target.value })} aria-label="Monto" />
            </div>
          </li>
        ))}
      </ul>

      {allowAdd && (
        <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { key: `n${Date.now()}`, label: `Registro ${rs.length + 1}`, date: toLocalInput(), amount: "", checked: true }])}>
          <Plus className="h-3.5 w-3.5" /> Añadir fila
        </Button>
      )}

      {rows.length > 0 && (
        <>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Método (para todos)</span>
            <Input list="ledger-methods-bf" value={method} onChange={(e) => setMethod(e.target.value)} />
            <datalist id="ledger-methods-bf">
              {METHODS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          {err && <p className="text-sm text-danger">{err}</p>}
          <Button className="w-full" disabled={busy || selected.length === 0} onClick={submit}>
            {busy ? "Guardando…" : `${submitLabel} (${selected.length}) · ${money(total)}`}
          </Button>
        </>
      )}
    </div>
  );
}
