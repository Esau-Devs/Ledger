import type { Cycle, Rental, RentalPayment } from "./types";

/* ------------------------------------------------------------------
 * Fechas "solo día" (YYYY-MM-DD). Se construyen con componentes locales,
 * así el resultado es el mismo en el navegador y en el servidor (cron).
 * ------------------------------------------------------------------ */
export const parseYmd = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayYmd = () => ymd(new Date());
/** Días de calendario de `a` a `b` (positivo si b es posterior). */
export const diffDays = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
export const fmtYmd = (s: string) => new Intl.DateTimeFormat("es-SV", { dateStyle: "medium" }).format(parseYmd(s));

/** Suma `k` ciclos a una fecha. En meses conserva el día (se ajusta al último día si el mes es más corto). */
export function addCycles(start: Date, cycle: Cycle, k: number): Date {
  const d = new Date(start);
  if (cycle === "weekly") d.setDate(d.getDate() + 7 * k);
  else if (cycle === "biweekly") d.setDate(d.getDate() + 14 * k);
  else if (cycle === "monthly" || cycle === "yearly") {
    const months = cycle === "yearly" ? 12 * k : k;
    const day = start.getDate();
    d.setDate(1);
    d.setMonth(start.getMonth() + months);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return d;
}

/* ------------------------------------------------------------------
 * Periodos de un alquiler. La renta de cada periodo vence el primer día de ese periodo.
 * ------------------------------------------------------------------ */
export type PeriodStatus = "paid" | "partial" | "due" | "overdue" | "upcoming";

export interface PeriodRow {
  index: number;
  start: string; // YYYY-MM-DD (inclusive)
  end: string; // YYYY-MM-DD (exclusive: inicio del siguiente periodo)
  due: number;
  paid: number;
  remaining: number;
  status: PeriodStatus;
  daysLate: number; // > 0 si ya pasó el inicio y falta cobrar
  future: boolean;
}

export function rentalPeriods(r: Rental, payments: RentalPayment[], today: string = todayYmd()): PeriodRow[] {
  const paidBy = new Map<number, number>();
  let maxPaid = -1;
  payments.forEach((p) => {
    paidBy.set(p.period_index, (paidBy.get(p.period_index) ?? 0) + Number(p.amount));
    maxPaid = Math.max(maxPaid, p.period_index);
  });

  const first = parseYmd(r.start_date);
  const end = r.end_date ?? (r.status === "ended" ? r.updated_at.slice(0, 10) : null);
  const rows: PeriodRow[] = [];
  let upcomingAdded = false;

  for (let k = 0; k < 3000; k++) {
    const start = ymd(addCycles(first, r.billing_cycle, k));
    if (end && start > end) break;
    const future = start > today;
    if (future && k > maxPaid) {
      if (upcomingAdded || r.status === "ended") break;
      upcomingAdded = true;
    }
    const due = Number(r.rent_amount);
    const paid = paidBy.get(k) ?? 0;
    const remaining = Math.max(0, due - paid);
    const daysLate = future ? 0 : diffDays(start, today);
    let status: PeriodStatus;
    if (remaining <= 0.005) status = "paid";
    else if (future) status = "upcoming";
    else if (daysLate > 0) status = "overdue";
    else status = paid > 0 ? "partial" : "due";
    rows.push({
      index: k,
      start,
      end: ymd(addCycles(first, r.billing_cycle, k + 1)),
      due,
      paid,
      remaining: remaining <= 0.005 ? 0 : remaining,
      status,
      daysLate,
      future,
    });
  }
  return rows;
}

export interface RentalSummary {
  expected: number; // renta de los periodos ya vencidos o iniciados
  received: number; // todo lo cobrado
  arrears: number; // pendiente de periodos ya iniciados
  unpaidPast: PeriodRow[]; // periodos iniciados con saldo
  next?: PeriodRow; // próximo periodo (futuro) sin cobrar
}

export function rentalSummary(rows: PeriodRow[]): RentalSummary {
  const past = rows.filter((r) => !r.future);
  return {
    expected: past.reduce((s, r) => s + r.due, 0),
    received: rows.reduce((s, r) => s + r.paid, 0),
    arrears: past.reduce((s, r) => s + r.remaining, 0),
    unpaidPast: past.filter((r) => r.remaining > 0),
    next: rows.find((r) => r.future && r.remaining > 0),
  };
}

export const periodLabel = (r: PeriodRow) => {
  const lastDay = parseYmd(r.end);
  lastDay.setDate(lastDay.getDate() - 1); // `end` es exclusivo
  return `#${r.index + 1} · ${fmtYmd(r.start)} – ${fmtYmd(ymd(lastDay))}`;
};

export const STATUS_LABEL: Record<PeriodStatus, string> = {
  paid: "Cobrado",
  partial: "Parcial",
  due: "Vence hoy",
  overdue: "Atrasado",
  upcoming: "Próximo",
};

/** Número de periodos atrasados de una obligación (suscripción/deuda): cuántos ciclos desde next_due_date ya pasaron. */
export function overdueDates(next: string, cycle: Cycle, now = new Date(), cap = 60): Date[] {
  if (cycle === "one_time") return new Date(next) <= now ? [new Date(next)] : [];
  const base = new Date(next);
  const out: Date[] = [];
  for (let i = 0; i < cap; i++) {
    const d = addCycles(base, cycle, i);
    if (d > now) break;
    out.push(d);
  }
  return out;
}
