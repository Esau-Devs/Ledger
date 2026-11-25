import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SB = Awaited<ReturnType<typeof createClient>>;
type Obj = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CYCLES = ["weekly", "biweekly", "monthly", "yearly", "one_time"];
const OB_TYPES = ["subscription", "debt"];
const OB_STATUS = ["active", "paused", "paid_off"];
const MAX_ROWS = 50000;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? NaN : Number(v));
const iso = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(+d) ? null : d.toISOString();
};
const str = (v: unknown, max = 1000) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim().slice(0, max));
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v.slice(0, 10))) ? v.slice(0, 10) : null);
/** created_at / updated_at solo si vienen válidos; si no, la base usa now(). */
const stamps = (r: Obj) => ({
  ...(iso(r.created_at) ? { created_at: iso(r.created_at) } : {}),
  ...(iso(r.updated_at) ? { updated_at: iso(r.updated_at) } : {}),
});

interface Report {
  inserted: Record<string, number>;
  skipped: number; // ya existían (duplicados)
  invalid: number; // filas descartadas por datos inválidos
  notes: string[];
}

async function fetchAll(sb: SB, table: string, cols: string): Promise<Obj[]> {
  const out: Obj[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Obj[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Inserta en bloques. `ignoreDuplicates`: ON CONFLICT (id) DO NOTHING -> reimportar un respaldo no duplica. */
async function insertAll(sb: SB, table: string, rows: Obj[], upsertById: boolean): Promise<Obj[]> {
  const out: Obj[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const q = upsertById
      ? sb.from(table).upsert(chunk, { onConflict: "id", ignoreDuplicates: true })
      : sb.from(table).insert(chunk);
    const { data, error } = await q.select("*");
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Obj[]));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* JSON: restauración fiel de un respaldo exportado por Ledger          */
/* ------------------------------------------------------------------ */
async function importJson(sb: SB, uid: string, data: unknown): Promise<Report> {
  if (!isObj(data)) throw new Error("El archivo no tiene el formato de respaldo de Ledger.");
  const rawO = arr(data.obligations);
  const rawP = arr(data.payment_logs);
  const rawL = arr(data.lent_money);
  const rawR = arr(data.lent_repayments);
  const rawRent = arr(data.rentals);
  const rawRentPay = arr(data.rental_payments);
  const total = rawO.length + rawP.length + rawL.length + rawR.length + rawRent.length + rawRentPay.length;
  if (total === 0) throw new Error("El respaldo está vacío o no es un respaldo de Ledger.");
  if (total > MAX_ROWS) throw new Error(`Demasiados registros (máximo ${MAX_ROWS}).`);

  let invalid = 0;
  const notes: string[] = [];

  const obligations: Obj[] = [];
  for (const r of rawO) {
    const amount = num(r.installment_amount);
    if (!isId(r.id) || !str(r.title) || !OB_TYPES.includes(String(r.type)) || !(amount >= 0) || !CYCLES.includes(String(r.billing_cycle)) || !iso(r.next_due_date)) {
      invalid++;
      continue;
    }
    const totalAmt = num(r.total_amount);
    const inst = num(r.installments_total);
    obligations.push({
      id: r.id,
      user_id: uid,
      title: str(r.title, 200),
      type: r.type,
      category: str(r.category, 100),
      total_amount: totalAmt >= 0 ? totalAmt : null,
      installments_total: inst > 0 ? Math.floor(inst) : null,
      started_at: iso(r.started_at),
      installment_amount: amount,
      currency: (str(r.currency, 3) ?? "USD").toUpperCase(),
      billing_cycle: r.billing_cycle,
      next_due_date: iso(r.next_due_date),
      reminder_days_before: num(r.reminder_days_before) >= 0 ? Math.floor(num(r.reminder_days_before)) : 2,
      status: OB_STATUS.includes(String(r.status)) ? r.status : "active",
      notes: str(r.notes, 2000),
      ...stamps(r),
    });
  }

  const loans: Obj[] = [];
  for (const r of rawL) {
    const lent = num(r.amount_lent);
    if (!isId(r.id) || !str(r.person_name) || !(lent > 0) || !iso(r.lent_at)) {
      invalid++;
      continue;
    }
    loans.push({
      id: r.id,
      user_id: uid,
      person_name: str(r.person_name, 200),
      amount_lent: lent,
      amount_returned: num(r.amount_returned) >= 0 ? num(r.amount_returned) : 0,
      lent_at: iso(r.lent_at),
      expected_return_date: iso(r.expected_return_date),
      payment_method: str(r.payment_method, 100),
      notes: str(r.notes, 2000),
      ...stamps(r),
    });
  }

  const rentals: Obj[] = [];
  for (const r of rawRent) {
    const rent = num(r.rent_amount);
    if (!isId(r.id) || !str(r.tenant_name) || !str(r.item) || !(rent > 0) || !["weekly", "biweekly", "monthly"].includes(String(r.billing_cycle)) || !day(r.start_date)) {
      invalid++;
      continue;
    }
    rentals.push({
      id: r.id,
      user_id: uid,
      tenant_name: str(r.tenant_name, 200),
      item: str(r.item, 200),
      rent_amount: rent,
      currency: (str(r.currency, 3) ?? "USD").toUpperCase(),
      billing_cycle: r.billing_cycle,
      start_date: day(r.start_date),
      end_date: day(r.end_date),
      deposit_amount: num(r.deposit_amount) >= 0 ? num(r.deposit_amount) : null,
      status: r.status === "ended" ? "ended" : "active",
      notes: str(r.notes, 2000),
      ...stamps(r),
    });
  }

  const obIds = new Set([...(await fetchAll(sb, "obligations", "id")).map((x) => String(x.id)), ...obligations.map((x) => String(x.id))]);
  const loanIds = new Set([...(await fetchAll(sb, "lent_money", "id")).map((x) => String(x.id)), ...loans.map((x) => String(x.id))]);

  let unlinked = 0;
  const logs: Obj[] = [];
  for (const r of rawP) {
    const amount = num(r.amount_paid);
    if (!isId(r.id) || !(amount >= 0) || !iso(r.paid_at)) {
      invalid++;
      continue;
    }
    let oid: string | null = null;
    if (r.obligation_id) {
      if (isId(r.obligation_id) && obIds.has(r.obligation_id)) oid = r.obligation_id;
      else unlinked++;
    }
    logs.push({
      id: r.id,
      user_id: uid,
      obligation_id: oid,
      amount_paid: amount,
      payment_method: str(r.payment_method, 100),
      paid_at: iso(r.paid_at),
      receipt_note: str(r.receipt_note, 2000),
      ...stamps(r),
    });
  }

  const repayments: Obj[] = [];
  for (const r of rawR) {
    const amount = num(r.amount);
    if (!isId(r.id) || !isId(r.lent_id) || !loanIds.has(r.lent_id) || !(amount > 0) || !iso(r.received_at)) {
      invalid++;
      continue;
    }
    repayments.push({ id: r.id, user_id: uid, lent_id: r.lent_id, amount, received_at: iso(r.received_at), method: str(r.method, 100), ...stamps(r) });
  }

  const rentalIds = new Set([...(await fetchAll(sb, "rentals", "id")).map((x) => String(x.id)), ...rentals.map((x) => String(x.id))]);
  const rentalPays: Obj[] = [];
  for (const r of rawRentPay) {
    const amount = num(r.amount);
    const idx = num(r.period_index);
    if (!isId(r.id) || !isId(r.rental_id) || !rentalIds.has(r.rental_id) || !(amount > 0) || !(idx >= 0) || !iso(r.received_at)) {
      invalid++;
      continue;
    }
    rentalPays.push({ id: r.id, user_id: uid, rental_id: r.rental_id, period_index: Math.floor(idx), amount, received_at: iso(r.received_at), method: str(r.method, 100), note: str(r.note, 2000), ...stamps(r) });
  }

  // Orden importante por las claves foráneas
  const inserted = {
    obligations: (await insertAll(sb, "obligations", obligations, true)).length,
    lent_money: (await insertAll(sb, "lent_money", loans, true)).length,
    rentals: (await insertAll(sb, "rentals", rentals, true)).length,
    payment_logs: (await insertAll(sb, "payment_logs", logs, true)).length,
    lent_repayments: (await insertAll(sb, "lent_repayments", repayments, true)).length,
    rental_payments: (await insertAll(sb, "rental_payments", rentalPays, true)).length,
  };

  const valid = obligations.length + loans.length + logs.length + repayments.length + rentals.length + rentalPays.length;
  const done = Object.values(inserted).reduce((a, b) => a + b, 0);
  if (unlinked > 0) notes.push(`${unlinked} pago(s) apuntaban a una obligación que no existe y se importaron como pagos sueltos.`);
  return { inserted, skipped: valid - done, invalid, notes };
}

/* ------------------------------------------------------------------ */
/* CSV: bitácora exportada (tipo,fecha_hora_utc,concepto_o_persona,...) */
/* ------------------------------------------------------------------ */
const keyOf = (kind: string, when: string, amount: unknown) => `${kind}|${new Date(when).getTime()}|${Number(amount).toFixed(2)}`;

async function importCsv(sb: SB, uid: string, rows: unknown): Promise<Report> {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("El CSV no tiene filas.");
  if (rows.length > MAX_ROWS) throw new Error(`Demasiadas filas (máximo ${MAX_ROWS}).`);

  type P = { kind: "pago" | "prestamo" | "abono"; when: string; concept: string | null; amount: number; method: string | null; note: string | null };
  const parsed: P[] = [];
  let invalid = 0;
  let rentRows = 0;
  for (const raw of rows) {
    if (!isObj(raw)) {
      invalid++;
      continue;
    }
    const kind = String(raw.tipo ?? "").trim().toLowerCase();
    if (kind === "alquiler") {
      rentRows++;
      continue;
    }
    const when = iso(raw.fecha_hora_utc ?? raw.fecha);
    const amount = num(raw.monto);
    if (!["pago", "prestamo", "abono"].includes(kind) || !when || !(amount >= 0) || (kind !== "pago" && !(amount > 0))) {
      invalid++;
      continue;
    }
    parsed.push({ kind: kind as P["kind"], when, concept: str(raw.concepto_o_persona, 200), amount, method: str(raw.metodo, 100), note: str(raw.nota, 2000) });
  }
  if (parsed.length === 0) throw new Error("No se encontró ninguna fila válida. ¿Es el CSV exportado por Ledger?");

  // Duplicados: misma clase + fecha/hora + monto que algo que ya existe
  const existing = new Set((await fetchAll(sb, "ledger_entries", "kind,occurred_at,amount")).map((e) => keyOf(String(e.kind), String(e.occurred_at), e.amount)));
  let skipped = 0;
  const fresh = parsed.filter((p) => {
    if (existing.has(keyOf(p.kind, p.when, p.amount))) {
      skipped++;
      return false;
    }
    return true;
  });

  const notes: string[] = [];
  const inserted = { payment_logs: 0, lent_money: 0, lent_repayments: 0 };

  // 1) Préstamos
  const newLoans = fresh.filter((p) => p.kind === "prestamo" && p.concept);
  invalid += fresh.filter((p) => p.kind === "prestamo" && !p.concept).length;
  const savedLoans = await insertAll(
    sb,
    "lent_money",
    newLoans.map((p) => ({ user_id: uid, person_name: p.concept, amount_lent: p.amount, lent_at: p.when, payment_method: p.method, notes: p.note })),
    false
  );
  inserted.lent_money = savedLoans.length;

  // 2) Pagos (sin ligar a obligación; el concepto se conserva en la nota)
  const logs = fresh
    .filter((p) => p.kind === "pago")
    .map((p) => {
      const tag = p.concept && p.concept !== "Pago suelto" ? `[${p.concept}]` : "";
      return {
        user_id: uid,
        amount_paid: p.amount,
        payment_method: p.method,
        paid_at: p.when,
        receipt_note: [tag, p.note].filter(Boolean).join(" ") || null,
      };
    });
  inserted.payment_logs = (await insertAll(sb, "payment_logs", logs, false)).length;

  // 3) Abonos: se asignan al préstamo más antiguo de esa persona con saldo suficiente
  const pool = [...(await fetchAll(sb, "lent_money", "id,person_name,amount_lent,amount_returned,lent_at")), ...savedLoans]
    .map((l) => ({
      id: String(l.id),
      person: String(l.person_name).trim().toLowerCase(),
      remaining: Number(l.amount_lent) - Number(l.amount_returned ?? 0),
      at: new Date(String(l.lent_at)).getTime(),
    }))
    // los recién insertados ya traen amount_returned = 0; los existentes se leen arriba (sin duplicar los nuevos)
    .filter((l, i, a) => a.findIndex((x) => x.id === l.id) === i)
    .sort((a, b) => a.at - b.at);

  const reps: Obj[] = [];
  let unmatched = 0;
  for (const p of fresh.filter((x) => x.kind === "abono").sort((a, b) => +new Date(a.when) - +new Date(b.when))) {
    const person = (p.concept ?? "").trim().toLowerCase();
    const loan = pool.find((l) => l.person === person && l.remaining >= p.amount - 0.005 && l.at <= new Date(p.when).getTime() + 1000);
    if (!loan) {
      unmatched++;
      continue;
    }
    loan.remaining -= p.amount;
    reps.push({ user_id: uid, lent_id: loan.id, amount: p.amount, received_at: p.when, method: p.method });
  }
  inserted.lent_repayments = (await insertAll(sb, "lent_repayments", reps, false)).length;

  if (unmatched > 0) notes.push(`${unmatched} abono(s) no se importaron porque no hay un préstamo de esa persona con saldo suficiente.`);
  if (rentRows > 0) notes.push(`${rentRows} fila(s) de alquiler no se importan desde CSV (el CSV no guarda el contrato). Restáuralas con el respaldo JSON.`);
  notes.push("Los pagos del CSV se importan como pagos sueltos (el CSV no guarda a qué obligación pertenecían). Para conservar esa relación usa el respaldo JSON.");
  return { inserted, skipped, invalid, notes };
}

/** POST /api/import  { format: "json", data } | { format: "csv", rows } — requiere sesión; RLS limita todo al usuario. */
export async function POST(req: Request) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Archivo no válido." }, { status: 400 });
  }
  if (!isObj(body)) return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });

  try {
    const report = body.format === "csv" ? await importCsv(sb, user.id, body.rows) : await importJson(sb, user.id, body.data);
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al importar." }, { status: 400 });
  }
}
