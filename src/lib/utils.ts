import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Cycle } from "./types";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const METHODS = ["Tarjeta Débito", "Tarjeta Crédito", "Transferencia", "Efectivo", "PayPal"];

export const CYCLE_LABEL: Record<Cycle, string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
  yearly: "Anual",
  one_time: "Pago único",
};

export const money = (n: number | null | undefined, currency = "USD") =>
  new Intl.NumberFormat("es-SV", { style: "currency", currency }).format(Number(n ?? 0));

/** Date|ISO -> valor para <input type="datetime-local"> en hora LOCAL del usuario. */
export const toLocalInput = (d: Date | string | null | undefined = new Date()) => {
  const x = d ? new Date(d) : new Date();
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/** Valor de datetime-local -> ISO UTC (lo que guardamos en timestamptz). */
export const fromLocalInput = (s: string) => new Date(s).toISOString();

export const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

export const fmtDay = (d: string | Date) =>
  new Intl.DateTimeFormat("es-SV", { dateStyle: "medium" }).format(new Date(d));

/** true si updated_at difiere de created_at (más de 2 s de tolerancia). */
export const wasEdited = (created: string, updated: string) =>
  new Date(updated).getTime() - new Date(created).getTime() > 2000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Días de calendario hasta una fecha (negativo = vencido). */
export const daysUntil = (d: string | Date) =>
  Math.round((startOfDay(new Date(d)) - startOfDay(new Date())) / 86400000);

export const dueLabel = (d: string | Date) => {
  const n = daysUntil(d);
  if (n < 0) return `Vencido hace ${-n} d`;
  if (n === 0) return "Hoy";
  if (n === 1) return "Mañana";
  return `En ${n} días`;
};

/** Equivalente mensual de un cobro recurrente. */
export const monthlyEquivalent = (amount: number, cycle: Cycle) => {
  switch (cycle) {
    case "weekly":
      return (amount * 52) / 12;
    case "biweekly":
      return (amount * 26) / 12;
    case "monthly":
      return amount;
    case "yearly":
      return amount / 12;
    default:
      return 0;
  }
};

export const monthKey = (d: string | Date) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
};
