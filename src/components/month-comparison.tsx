"use client";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn, money } from "@/lib/utils";

export interface MonthTotals {
  sub: number;
  debt: number;
  other: number;
}

const ROWS = [
  { key: "sub", name: "Suscripciones", color: "var(--chart-sub)" },
  { key: "debt", name: "Deudas", color: "var(--chart-debt)" },
  { key: "other", name: "Otros pagos", color: "var(--chart-other)" },
] as const;

const total = (t: MonthTotals) => t.sub + t.debt + t.other;

/** Variación en %. Un aumento de gasto va en rojo, una baja en verde; el icono evita depender solo del color. */
function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return <span className="text-muted-foreground">—</span>;
  if (before === 0) return <span className="text-muted-foreground">nuevo</span>;
  const pct = ((now - before) / before) * 100;
  if (Math.abs(pct) < 0.5) {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground">
        <Minus className="h-3 w-3" /> 0%
      </span>
    );
  }
  const up = pct > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-danger" : "text-success")}>
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export function MonthComparison({
  current,
  previous,
  average,
  labels,
}: {
  current: MonthTotals;
  previous: MonthTotals;
  average: MonthTotals; // promedio de los 3 meses anteriores al actual
  labels: { current: string; previous: string };
}) {
  const rows = [...ROWS.map((r) => ({ ...r, c: current[r.key], p: previous[r.key], a: average[r.key] })), { key: "total", name: "Total", color: "", c: total(current), p: total(previous), a: total(average) }];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="py-2 text-left font-medium" />
            <th className="py-2 text-right font-medium"><span className="capitalize">{labels.current}</span> (a hoy)</th>
            <th className="py-2 text-right font-medium capitalize">{labels.previous}</th>
            <th className="py-2 text-right font-medium">vs mes ant.</th>
            <th className="py-2 text-right font-medium">Prom. 3 m</th>
            <th className="py-2 text-right font-medium">vs prom.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={cn("border-b border-border last:border-0", r.key === "total" && "font-semibold")}>
              <td className="py-2 pr-2">
                <span className="flex items-center gap-1.5">
                  {r.color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />}
                  {r.name}
                </span>
              </td>
              <td className="py-2 text-right tabular-nums">{money(r.c)}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{money(r.p)}</td>
              <td className="py-2 text-right text-xs">
                <Delta now={r.c} before={r.p} />
              </td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{money(r.a)}</td>
              <td className="py-2 text-right text-xs">
                <Delta now={r.c} before={r.a} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">El mes en curso se compara completo contra meses cerrados, así que a mitad de mes es normal verlo por debajo.</p>
    </div>
  );
}
