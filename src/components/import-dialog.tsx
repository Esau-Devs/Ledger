"use client";
import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { refresh } from "@/lib/refresh";
import { csvToObjects } from "@/lib/csv";
import { Button, Modal } from "./ui";

type Parsed =
  | { format: "json"; payload: unknown; summary: string }
  | { format: "csv"; payload: Record<string, string>[]; summary: string };

interface Result {
  inserted: Record<string, number>;
  skipped: number;
  invalid: number;
  notes: string[];
}

const LABEL: Record<string, string> = {
  obligations: "obligaciones",
  payment_logs: "pagos",
  lent_money: "préstamos",
  lent_repayments: "abonos",
  rentals: "alquileres",
  rental_payments: "cobros de alquiler",
};

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  function reset() {
    setName("");
    setParsed(null);
    setErr("");
    setResult(null);
    if (input.current) input.current.value = "";
  }
  function close() {
    reset();
    onClose();
  }

  async function pick(file: File | undefined) {
    setErr("");
    setResult(null);
    setParsed(null);
    if (!file) return;
    setName(file.name);
    if (file.size > 4 * 1024 * 1024) return setErr("El archivo supera 4 MB.");
    const text = await file.text();

    try {
      if (file.name.toLowerCase().endsWith(".json")) {
        const data = JSON.parse(text);
        const n = (k: string) => (Array.isArray(data?.[k]) ? data[k].length : 0);
        const total = n("obligations") + n("payment_logs") + n("lent_money") + n("lent_repayments") + n("rentals") + n("rental_payments");
        if (total === 0) return setErr("No parece un respaldo JSON de Ledger.");
        setParsed({
          format: "json",
          payload: data,
          summary: `${n("obligations")} obligaciones · ${n("payment_logs")} pagos · ${n("lent_money")} préstamos · ${n("lent_repayments")} abonos · ${n("rentals")} alquileres · ${n("rental_payments")} cobros de alquiler`,
        });
      } else if (file.name.toLowerCase().endsWith(".csv")) {
        const rows = csvToObjects(text);
        if (rows.length === 0 || !("tipo" in rows[0]) || !("monto" in rows[0])) return setErr("El CSV debe ser el exportado por Ledger (columnas tipo, fecha_hora_utc, monto…).");
        const c = (t: string) => rows.filter((r) => r.tipo?.trim().toLowerCase() === t).length;
        setParsed({ format: "csv", payload: rows, summary: `${c("pago")} pagos · ${c("prestamo")} préstamos · ${c("abono")} abonos${c("alquiler") ? ` (${c("alquiler")} de alquiler se omiten: usa el JSON)` : ""}` });
      } else {
        setErr("Usa un archivo .json o .csv exportado por Ledger.");
      }
    } catch {
      setErr("No se pudo leer el archivo.");
    }
  }

  async function run() {
    if (!parsed) return;
    setBusy(true);
    setErr("");
    const body = parsed.format === "json" ? { format: "json", data: parsed.payload } : { format: "csv", rows: parsed.payload };
    try {
      const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setErr(json.error ?? "No se pudo importar.");
      else {
        setResult(json as Result);
        refresh();
      }
    } catch {
      setErr("Error de red al importar.");
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={close} title="Importar datos">
      {result ? (
        <div className="space-y-3 text-sm">
          <p className="font-medium text-success">Importación terminada.</p>
          <ul className="space-y-0.5 text-muted-foreground">
            {Object.entries(result.inserted).map(([k, v]) => (
              <li key={k}>
                {v} {LABEL[k] ?? k} importados
              </li>
            ))}
            <li>{result.skipped} omitidos (ya existían)</li>
            {result.invalid > 0 && <li>{result.invalid} filas descartadas por datos inválidos</li>}
          </ul>
          {result.notes.map((n) => (
            <p key={n} className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {n}
            </p>
          ))}
          <Button className="w-full" onClick={close}>
            Listo
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sube un respaldo <b>.json</b> (restauración completa, conserva la relación pago ↔ obligación) o un <b>.csv</b> de la bitácora. Lo que ya existe no se duplica.
          </p>
          <input
            ref={input}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <Button variant="outline" className="w-full" onClick={() => input.current?.click()}>
            <FileUp className="h-4 w-4" /> {name || "Elegir archivo"}
          </Button>
          {parsed && <p className="rounded-md bg-muted px-3 py-2 text-sm">Se encontró: {parsed.summary}</p>}
          {err && <p className="text-sm text-danger">{err}</p>}
          <Button className="w-full" disabled={!parsed || busy} onClick={run}>
            {busy ? "Importando…" : "Importar"}
          </Button>
        </div>
      )}
    </Modal>
  );
}
