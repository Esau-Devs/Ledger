import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** GET /api/export?format=csv|json — requiere sesión; RLS limita todo al usuario. */
export async function GET(req: Request) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "csv";

  // PostgREST devuelve como máximo 1000 filas por petición: se pagina para no truncar el respaldo
  const all = async (table: string, select: string, order: string) => {
    const data: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await sb.from(table).select(select).order(order).order("id").range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      data.push(...((page ?? []) as any[]));
      if (!page || page.length < 1000) break;
    }
    return { data };
  };

  const [obs, logs, loans, reps] = await Promise.all([
    all("obligations", "*", "created_at"),
    all("payment_logs", "*, obligations(title,type,category)", "paid_at"),
    all("lent_money", "*", "lent_at"),
    all("lent_repayments", "*", "received_at"),
  ]);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const body = JSON.stringify(
      { exported_at: new Date().toISOString(), obligations: obs.data, payment_logs: logs.data, lent_money: loans.data, lent_repayments: reps.data },
      null,
      2
    );
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="ledger-backup-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // CSV: bitácora unificada
  type Row = [string, string, string, string | number, string, string, string];
  const rows: Row[] = [];
  (logs.data ?? []).forEach((x: any) =>
    rows.push(["pago", x.paid_at, x.obligations?.title ?? "Pago suelto", x.amount_paid, x.payment_method ?? "", x.receipt_note ?? "", x.obligations?.type ?? ""])
  );
  (loans.data ?? []).forEach((l: any) =>
    rows.push(["prestamo", l.lent_at, l.person_name, l.amount_lent, l.payment_method ?? "", l.notes ?? "", l.status])
  );
  const byLoan = new Map((loans.data ?? []).map((l: any) => [l.id, l.person_name]));
  (reps.data ?? []).forEach((r: any) =>
    rows.push(["abono", r.received_at, byLoan.get(r.lent_id) ?? "", r.amount, r.method ?? "", "", ""])
  );
  rows.sort((a, b) => +new Date(a[1]) - +new Date(b[1]));

  const header = ["tipo", "fecha_hora_utc", "concepto_o_persona", "monto", "metodo", "nota", "detalle"];
  const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledger-bitacora-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
