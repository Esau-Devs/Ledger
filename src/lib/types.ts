export type Cycle = "weekly" | "biweekly" | "monthly" | "yearly" | "one_time";
export type ObType = "subscription" | "debt";
export type ObStatus = "active" | "paused" | "paid_off";
export type LentStatus = "pending" | "partial" | "settled";

export interface Obligation {
  id: string;
  user_id: string;
  title: string;
  type: ObType;
  category: string | null;
  total_amount: number | null;
  installments_total: number | null;
  started_at: string | null;
  installment_amount: number;
  currency: string;
  billing_cycle: Cycle;
  next_due_date: string;
  reminder_days_before: number;
  status: ObStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentLog {
  id: string;
  user_id: string;
  obligation_id: string | null;
  amount_paid: number;
  payment_method: string | null;
  paid_at: string;
  receipt_note: string | null;
  created_at: string;
  updated_at: string;
  obligations?: { title: string; type: ObType; category: string | null } | null;
}

export interface Lent {
  id: string;
  user_id: string;
  person_name: string;
  amount_lent: number;
  amount_returned: number;
  lent_at: string;
  expected_return_date: string | null;
  payment_method: string | null;
  status: LentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Fila de la vista public.ledger_entries (bitácora unificada). */
export interface LedgerEntry {
  kind: "pago" | "prestamo" | "abono" | "alquiler";
  id: string;
  user_id: string;
  occurred_at: string;
  title: string;
  sub: string;
  amount: number;
  method: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  type: "subscription" | "debt" | "suelto" | "prestamo" | "abono" | "alquiler";
}

export interface Repayment {
  id: string;
  user_id: string;
  lent_id: string;
  amount: number;
  received_at: string;
  method: string | null;
  created_at: string;
  updated_at: string;
}

export type RentalCycle = "weekly" | "biweekly" | "monthly";

export interface Rental {
  id: string;
  user_id: string;
  tenant_name: string;
  item: string;
  rent_amount: number;
  currency: string;
  billing_cycle: RentalCycle;
  start_date: string; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD
  deposit_amount: number | null;
  status: "active" | "ended";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentalPayment {
  id: string;
  user_id: string;
  rental_id: string;
  period_index: number;
  amount: number;
  received_at: string;
  method: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}
