import type { Lent, Obligation, PaymentLog, Rental, RentalPayment, Repayment } from "./types";
import { CYCLE_LABEL, fmtDate, money, monthlyEquivalent } from "./utils";
import { STATUS_LABEL, addCycles, diffDays, fmtYmd, periodLabel, rentalPeriods, rentalSummary, todayYmd } from "./rentals";

export interface ReportTable {
  title: string;
  columns: string[];
  rows: string[][];
  numeric?: number[]; // índices de columnas alineadas a la derecha
}

export interface Report {
  title: string;
  subtitle: string;
  facts: [string, string][];
  stats: [string, string][];
  tables: ReportTable[];
  notes: string[];
  filename: string;
}

const DAY = 86400000;
const days = (a: string | Date, b: string | Date) => Math.round((+new Date(b) - +new Date(a)) / DAY);

export function fmtSpan(d: number): string {
  d = Math.max(0, d);
  if (d < 45) return `${d} día${d === 1 ? "" : "s"}`;
  const months = d / 30.4375;
  if (months < 24) return `${d} días (≈ ${months.toFixed(1)} meses)`;
  return `${d} días (≈ ${(months / 12).toFixed(1)} años)`;
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "informe";

const avgGap = (dates: string[]) => {
  if (dates.length < 2) return null;
  return days(dates[0], dates[dates.length - 1]) / (dates.length - 1);
};

/* ------------------------------------------------------------------ */
/* Deuda o suscripción                                                 */
/* ------------------------------------------------------------------ */
export function buildObligationReport(o: Obligation, logs: PaymentLog[], now = new Date()): Report {
  const sorted = [...logs].sort((a, b) => +new Date(a.paid_at) - +new Date(b.paid_at));
  const n = sorted.length;
  const total = sorted.reduce((s, x) => s + Number(x.amount_paid), 0);
  const firstIso = sorted[0]?.paid_at;
  const lastIso = sorted[n - 1]?.paid_at;
  const startIso = o.started_at ?? firstIso ?? o.created_at;
  const startNote = o.started_at ? "" : firstIso ? " (fecha del primer pago)" : " (fecha de alta en Ledger)";
  const endIso = o.status === "paid_off" && lastIso ? lastIso : now.toISOString();
  const span = days(startIso, endIso);
  const isDebt = o.type === "debt";
  const cur = o.currency;
  const m = (x: number) => money(x, cur);

  const nTotal = o.installments_total ?? (isDebt && o.total_amount && o.installment_amount > 0 ? Math.ceil(o.total_amount / o.installment_amount) : null);
  const gap = avgGap(sorted.map((x) => x.paid_at));

  const facts: [string, string][] = [
    ["Tipo", isDebt ? "Deuda" : "Suscripción"],
    ["Categoría", o.category || "—"],
    ["Ciclo", CYCLE_LABEL[o.billing_cycle]],
    [isDebt ? "Monto de cada cuota" : "Monto por cobro", m(o.installment_amount)],
  ];
  if (isDebt && o.total_amount != null) facts.push(["Monto total de la deuda", m(o.total_amount)]);
  if (nTotal) facts.push(["Cuotas", String(nTotal)]);
  facts.push(["Inicio", fmtDate(startIso) + startNote]);
  facts.push(["Estado", o.status === "active" ? "Activa" : o.status === "paused" ? "Pausada" : "Liquidada"]);
  if (o.status === "active") facts.push(["Próximo pago", fmtDate(o.next_due_date)]);
  if (o.notes) facts.push(["Notas", o.notes]);

  const stats: [string, string][] = [
    ["Pagos registrados", String(n)],
    ["Total pagado", m(total)],
    ["Pago promedio", n ? m(total / n) : "—"],
    ["Primer pago", firstIso ? fmtDate(firstIso) : "—"],
    ["Último pago", lastIso ? fmtDate(lastIso) : "—"],
    [o.status === "paid_off" ? "Tiempo que tardó en liquidarse" : "Tiempo transcurrido", fmtSpan(span)],
    ["Promedio entre pagos", gap == null ? "—" : `${gap.toFixed(1)} días`],
  ];
  if (isDebt && o.total_amount != null) {
    stats.push(["Pendiente", m(Math.max(0, o.total_amount - total))]);
    stats.push(["Avance", `${Math.min(100, (total / o.total_amount) * 100).toFixed(0)} %`]);
  }
  if (isDebt && nTotal) {
    stats.push(["Cuotas pagadas", `${n} de ${nTotal}`]);
    if (o.status === "active" && n < nTotal && o.billing_cycle !== "one_time") {
      const est = addCycles(new Date(o.next_due_date), o.billing_cycle, nTotal - n - 1);
      stats.push(["Fin estimado", fmtDate(est.toISOString())]);
    }
  }
  if (!isDebt) {
    const mo = monthlyEquivalent(o.installment_amount, o.billing_cycle);
    stats.push(["Equivalente mensual", m(mo)]);
    stats.push(["Costo anual estimado", m(mo * 12)]);
  }

  let acc = 0;
  const showBalance = isDebt && o.total_amount != null;
  const columns = ["#", "Fecha y hora", "Monto", "Método", "Referencia", "Días desde el anterior", "Acumulado"];
  if (showBalance) columns.push("Saldo pendiente");
  const rows = sorted.map((x, i) => {
    acc += Number(x.amount_paid);
    const prev = i === 0 ? (o.started_at ? o.started_at : null) : sorted[i - 1].paid_at;
    const row = [
      String(i + 1),
      fmtDate(x.paid_at),
      m(Number(x.amount_paid)),
      x.payment_method || "—",
      x.receipt_note || "—",
      prev ? String(days(prev, x.paid_at)) : "—",
      m(acc),
    ];
    if (showBalance) row.push(m(Math.max(0, (o.total_amount ?? 0) - acc)));
    return row;
  });

  return {
    title: o.title,
    subtitle: `Informe de ${isDebt ? "deuda" : "suscripción"} · generado el ${fmtDate(now.toISOString())}`,
    facts,
    stats,
    tables: [{ title: "Historial de pagos", columns, rows, numeric: [2, 5, 6, 7] }],
    notes: n === 0 ? ["Todavía no hay pagos registrados."] : [],
    filename: `informe-${slug(o.title)}`,
  };
}

/* ------------------------------------------------------------------ */
/* Préstamo otorgado                                                   */
/* ------------------------------------------------------------------ */
export function buildLoanReport(l: Lent, reps: Repayment[], now = new Date()): Report {
  const sorted = [...reps].sort((a, b) => +new Date(a.received_at) - +new Date(b.received_at));
  const returned = sorted.reduce((s, x) => s + Number(x.amount), 0);
  const remaining = Math.max(0, Number(l.amount_lent) - returned);
  const settled = remaining <= 0.005;
  const lastIso = sorted[sorted.length - 1]?.received_at;
  const endIso = settled && lastIso ? lastIso : now.toISOString();
  const gap = avgGap(sorted.map((x) => x.received_at));

  const facts: [string, string][] = [
    ["Persona", l.person_name],
    ["Monto prestado", money(l.amount_lent)],
    ["Fecha del préstamo", fmtDate(l.lent_at)],
    ["Cómo se entregó", l.payment_method || "—"],
    ["Devolución esperada", l.expected_return_date ? fmtDate(l.expected_return_date) : "—"],
    ["Estado", settled ? "Liquidado" : returned > 0 ? "Parcial" : "Pendiente"],
  ];
  if (l.notes) facts.push(["Notas", l.notes]);

  const stats: [string, string][] = [
    ["Abonos recibidos", String(sorted.length)],
    ["Total devuelto", money(returned)],
    ["Saldo pendiente", money(remaining)],
    ["Avance", `${Math.min(100, (returned / Number(l.amount_lent)) * 100).toFixed(0)} %`],
    [settled ? "Tiempo que tardó en liquidarse" : "Tiempo desde el préstamo", fmtSpan(days(l.lent_at, endIso))],
    ["Promedio entre abonos", gap == null ? "—" : `${gap.toFixed(1)} días`],
  ];
  if (l.expected_return_date) {
    const late = days(l.expected_return_date, endIso);
    stats.push([settled ? "Liquidado respecto a lo esperado" : "Respecto a la fecha esperada", late > 0 ? `${late} días tarde` : late === 0 ? "A tiempo" : `${-late} días antes`]);
  }

  let acc = 0;
  const rows = sorted.map((x, i) => {
    acc += Number(x.amount);
    const prev = i === 0 ? l.lent_at : sorted[i - 1].received_at;
    return [String(i + 1), fmtDate(x.received_at), money(Number(x.amount)), x.method || "—", String(days(prev, x.received_at)), money(acc), money(Math.max(0, Number(l.amount_lent) - acc))];
  });

  return {
    title: `Préstamo a ${l.person_name}`,
    subtitle: `Informe de préstamo otorgado · generado el ${fmtDate(now.toISOString())}`,
    facts,
    stats,
    tables: [{ title: "Historial de abonos", columns: ["#", "Fecha y hora", "Monto", "Método", "Días desde el anterior", "Devuelto acumulado", "Saldo pendiente"], rows, numeric: [2, 4, 5, 6] }],
    notes: sorted.length === 0 ? ["Todavía no hay abonos registrados."] : ["«Días desde el anterior» del primer abono cuenta desde la fecha del préstamo."],
    filename: `informe-prestamo-${slug(l.person_name)}`,
  };
}

/* ------------------------------------------------------------------ */
/* Alquiler                                                            */
/* ------------------------------------------------------------------ */
export function buildRentalReport(r: Rental, pays: RentalPayment[], today: string = todayYmd(), now = new Date()): Report {
  const periods = rentalPeriods(r, pays, today);
  const sum = rentalSummary(periods);
  const cycleName = r.billing_cycle === "monthly" ? "Mensual" : r.billing_cycle === "biweekly" ? "Quincenal" : "Semanal";
  const m = (x: number) => money(x, r.currency);
  const sorted = [...pays].sort((a, b) => +new Date(a.received_at) - +new Date(b.received_at));
  const byIndex = new Map(periods.map((p) => [p.index, p]));

  const lates = sorted
    .map((p) => {
      const per = byIndex.get(p.period_index);
      return per ? days(per.start, p.received_at.slice(0, 10)) : null;
    })
    .filter((x): x is number => x != null);
  const avgLate = lates.length ? lates.reduce((s, x) => s + x, 0) / lates.length : null;

  const facts: [string, string][] = [
    ["Inquilino", r.tenant_name],
    ["Alquilado", r.item],
    ["Renta", `${m(Number(r.rent_amount))} · ${cycleName}`],
    ["Inicio", fmtYmd(r.start_date)],
    ["Fin", r.end_date ? fmtYmd(r.end_date) : r.status === "ended" ? "Finalizado" : "Sin fecha de fin"],
    ["Estado", r.status === "active" ? "Activo" : "Finalizado"],
  ];
  if (r.deposit_amount != null) facts.push(["Depósito", m(Number(r.deposit_amount))]);
  if (r.notes) facts.push(["Notas", r.notes]);

  const started = periods.filter((p) => !p.future);
  const stats: [string, string][] = [
    ["Periodos transcurridos", String(started.length)],
    ["Cobrados completos", String(started.filter((p) => p.status === "paid").length)],
    ["Con saldo pendiente", String(sum.unpaidPast.length)],
    ["Renta esperada a hoy", m(sum.expected)],
    ["Total cobrado", m(sum.received)],
    ["Pendiente (atrasado)", m(sum.arrears)],
    ["Tiempo de alquiler", fmtSpan(diffDays(r.start_date, r.end_date ?? today))],
    ["Retraso promedio al cobrar", avgLate == null ? "—" : `${avgLate.toFixed(1)} días`],
  ];

  const periodRows = periods.map((p) => [
    periodLabel(p),
    fmtYmd(p.start),
    m(p.due),
    m(p.paid),
    m(p.remaining),
    p.status === "overdue" ? `${STATUS_LABEL[p.status]} (${p.daysLate} d)` : STATUS_LABEL[p.status],
  ]);

  const payRows = sorted.map((p, i) => {
    const per = byIndex.get(p.period_index);
    return [
      String(i + 1),
      fmtDate(p.received_at),
      per ? `#${per.index + 1} · ${fmtYmd(per.start)}` : `#${p.period_index + 1}`,
      m(Number(p.amount)),
      p.method || "—",
      p.note || "—",
      per ? String(days(per.start, p.received_at.slice(0, 10))) : "—",
    ];
  });

  return {
    title: `${r.item} · ${r.tenant_name}`,
    subtitle: `Informe de alquiler · generado el ${fmtDate(now.toISOString())}`,
    facts,
    stats,
    tables: [
      { title: "Periodos", columns: ["Periodo", "Vence", "Renta", "Cobrado", "Pendiente", "Estado"], rows: periodRows, numeric: [2, 3, 4] },
      { title: "Cobros recibidos", columns: ["#", "Fecha y hora", "Periodo", "Monto", "Método", "Nota", "Días tras el inicio del periodo"], rows: payRows, numeric: [3, 6] },
    ],
    notes: ["La renta de cada periodo vence el primer día de ese periodo. Un cobro con días negativos se recibió por adelantado."],
    filename: `informe-alquiler-${slug(r.item)}-${slug(r.tenant_name)}`,
  };
}

/* ------------------------------------------------------------------ */
/* CSV del informe (para Excel / Google Sheets)                        */
/* ------------------------------------------------------------------ */
const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const line = (cells: string[]) => cells.map(esc).join(",");

export function reportToCsv(r: Report): string {
  const out: string[] = [line([r.title]), line([r.subtitle]), "", line(["Datos", "Valor"]), ...r.facts.map(([k, v]) => line([k, v])), "", line(["Resumen", "Valor"]), ...r.stats.map(([k, v]) => line([k, v]))];
  r.tables.forEach((t) => {
    out.push("", line([t.title]), line(t.columns), ...t.rows.map(line));
  });
  return "﻿" + out.join("\r\n");
}
