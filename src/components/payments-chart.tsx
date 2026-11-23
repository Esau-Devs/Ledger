"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn, money } from "@/lib/utils";

export interface MonthPoint {
  label: string;
  sub: number;
  debt: number;
  other: number;
}

const SERIES = [
  { key: "sub", name: "Suscripciones", color: "var(--chart-sub)" },
  { key: "debt", name: "Deudas", color: "var(--chart-debt)" },
  { key: "other", name: "Otros pagos", color: "var(--chart-other)" },
] as const;

const tick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

function Tip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + Number(p.value || 0), 0);
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium capitalize">{label}</p>
      {SERIES.map((s) => {
        const v = payload.find((p) => p.dataKey === s.key)?.value ?? 0;
        return (
          <p key={s.key} className="flex items-center justify-between gap-4 text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
              {s.name}
            </span>
            <span className="font-medium text-foreground">{money(v)}</span>
          </p>
        );
      })}
      <p className="mt-1 flex justify-between gap-4 border-t border-border pt-1 font-medium">
        <span>Total</span>
        <span>{money(total)}</span>
      </p>
    </div>
  );
}

export function PaymentsChart({ data }: { data: MonthPoint[] }) {
  const [table, setTable] = useState(false);
  const sums = SERIES.map((s) => ({ ...s, total: data.reduce((a, d) => a + d[s.key], 0) }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {sums.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.name} <span className="font-medium text-foreground">{money(s.total)}</span>
            </li>
          ))}
        </ul>
        <button onClick={() => setTable((v) => !v)} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          {table ? "Ver gráfica" : "Ver tabla"}
        </button>
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 font-medium">Mes</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="py-1.5 text-right font-medium">
                    {s.name}
                  </th>
                ))}
                <th className="py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label} className="border-b border-border last:border-0">
                  <td className="py-1.5 capitalize">{d.label}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="py-1.5 text-right tabular-nums">
                      {money(d[s.key])}
                    </td>
                  ))}
                  <td className={cn("py-1.5 text-right font-medium tabular-nums")}>{money(d.sub + d.debt + d.other)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-56 w-full" role="img" aria-label="Pagos por mes, separados en suscripciones, deudas y otros pagos">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tick} />
              <YAxis tickLine={false} axisLine={false} tick={tick} width={52} tickFormatter={(v) => `$${v}`} />
              <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }} content={<Tip />} />
              {SERIES.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="m"
                  fill={s.color}
                  stroke="hsl(var(--card))" /* separador de 2 px entre segmentos */
                  strokeWidth={2}
                  maxBarSize={36}
                  radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
