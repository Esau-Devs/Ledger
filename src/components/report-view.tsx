"use client";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { reportToCsv, type Report } from "@/lib/reports";
import { Button } from "./ui";

function downloadCsv(r: Report) {
  const blob = new Blob([reportToCsv(r)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${r.filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ReportView({ report, onBack }: { report: Report; onBack: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
      {/* Barra de acciones: no se imprime */}
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadCsv(report)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      <header className="mb-6 border-b border-border pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ledger</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{report.title}</h1>
        <p className="text-sm text-muted-foreground">{report.subtitle}</p>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Datos</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {report.facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border py-1.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Resumen</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {report.stats.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border p-3 print:break-inside-avoid">
              <p className="text-[11px] text-muted-foreground">{k}</p>
              <p className="mt-0.5 text-sm font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {report.tables.map((t) => (
        <section key={t.title} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">{t.title}</h2>
          {t.rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Sin registros.</p>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    {t.columns.map((c, i) => (
                      <th key={c} className={cn("py-1.5 pr-3 font-medium", t.numeric?.includes(i) && "text-right")}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r, ri) => (
                    <tr key={ri} className="border-b border-border last:border-0 print:break-inside-avoid">
                      {r.map((c, i) => (
                        <td key={i} className={cn("py-1.5 pr-3 align-top", t.numeric?.includes(i) && "text-right tabular-nums")}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {report.notes.map((n) => (
        <p key={n} className="mb-1 text-xs text-muted-foreground">
          {n}
        </p>
      ))}
    </div>
  );
}
