import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import { diffDays, fmtYmd, rentalPeriods, rentalSummary } from "@/lib/rentals";
import type { Rental, RentalPayment } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = process.env.APP_TIMEZONE || "America/El_Salvador";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: number, c = "USD") => new Intl.NumberFormat("es-SV", { style: "currency", currency: c }).format(n);
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // YYYY-MM-DD en la zona del usuario
const fmt = (d: string) => new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(d));

/** Días de calendario (en la zona del usuario) entre hoy y `iso`. Negativo = vencido. */
function daysFromToday(iso: string) {
  const a = Date.parse(ymd(new Date()));
  const b = Date.parse(ymd(new Date(iso)));
  return Math.round((b - a) / 86400000);
}
const when = (n: number) => (n < 0 ? `vencido hace ${-n} d` : n === 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`);

interface Line {
  title: string;
  amount: string;
  date: string;
  days: number;
}

function buildEmail(pay: Line[], collect: Line[], site: string) {
  const section = (title: string, lines: Line[]) =>
    lines.length === 0
      ? ""
      : `<h3 style="margin:24px 0 8px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:.04em">${title}</h3>
<table style="width:100%;border-collapse:collapse">${lines
          .map(
            (l) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid #e4e4e7"><div style="font-weight:600;color:#18181b">${esc(l.title)}</div>
<div style="font-size:12px;color:#71717a">${esc(l.date)} · <span style="color:${l.days < 0 ? "#dc2626" : l.days === 0 ? "#d97706" : "#71717a"}">${when(l.days)}</span></div></td>
<td style="padding:10px 0;border-bottom:1px solid #e4e4e7;text-align:right;font-weight:600;color:#18181b">${esc(l.amount)}</td></tr>`
          )
          .join("")}</table>`;

  return `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="font-size:15px;font-weight:700;color:#18181b">Ledger</div>
<p style="color:#52525b;font-size:14px;margin:8px 0 0">Resumen de vencimientos próximos.</p>
${section("Pagos por vencer", pay)}${section("Cobros pendientes", collect)}
<p style="margin-top:28px"><a href="${esc(site)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600">Abrir Ledger</a></p>
</div></body></html>`;
}

/**
 * GET /api/cron/reminders
 * Protegido con CRON_SECRET (Authorization: Bearer <token>). Vercel Cron lo envía solo.
 * ?dry=1 → no envía correos, devuelve lo que se enviaría (útil para probar).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Faltan variables de Supabase" }, { status: 500 });

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const [obs, lent] = await Promise.all([
    admin.from("obligations").select("user_id,title,installment_amount,currency,next_due_date,reminder_days_before").eq("status", "active"),
    admin.from("lent_money").select("user_id,person_name,amount_lent,amount_returned,expected_return_date").neq("status", "settled").not("expected_return_date", "is", null),
  ]);
  if (obs.error || lent.error) return NextResponse.json({ error: (obs.error ?? lent.error)!.message }, { status: 500 });

  const perUser = new Map<string, { pay: (Line & { sort: number })[]; collect: (Line & { sort: number })[] }>();
  const bucket = (id: string) => {
    if (!perUser.has(id)) perUser.set(id, { pay: [], collect: [] });
    return perUser.get(id)!;
  };

  for (const o of obs.data ?? []) {
    const days = daysFromToday(o.next_due_date);
    if (days <= o.reminder_days_before) {
      bucket(o.user_id).pay.push({ title: o.title, amount: money(Number(o.installment_amount), o.currency), date: fmt(o.next_due_date), days, sort: days });
    }
  }
  for (const l of lent.data ?? []) {
    const days = daysFromToday(l.expected_return_date!);
    if (days <= 3) {
      bucket(l.user_id).collect.push({
        title: `Cobrar a ${l.person_name}`,
        amount: money(Number(l.amount_lent) - Number(l.amount_returned)),
        date: fmt(l.expected_return_date!),
        days,
        sort: days,
      });
    }
  }

  // Alquileres: periodos ya iniciados sin cobrar, o el próximo en 2 días o menos
  try {
    const [rentals, rpays] = await Promise.all([fetchAll<Rental>(admin, "rentals", "*"), fetchAll<RentalPayment>(admin, "rental_payments", "*")]);
    const today = ymd(new Date());
    for (const r of rentals.filter((x) => x.status === "active")) {
      const sum = rentalSummary(rentalPeriods(r, rpays.filter((p) => p.rental_id === r.id), today));
      const first = sum.unpaidPast[0];
      const next = !first && sum.next && diffDays(today, sum.next.start) <= 2 ? sum.next : null;
      const target = first ?? next;
      if (!target) continue;
      const days = diffDays(today, target.start);
      bucket(r.user_id).collect.push({
        title: `Cobrar alquiler · ${r.tenant_name} (${r.item})` + (sum.unpaidPast.length > 1 ? ` · ${sum.unpaidPast.length} periodos` : ""),
        amount: money(first ? sum.arrears : target.remaining, r.currency),
        date: fmtYmd(target.start),
        days,
        sort: days,
      });
    }
  } catch {
    /* migration-v3 aún no aplicada: se envían solo pagos y préstamos */
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const from = process.env.RESEND_FROM || "Ledger <onboarding@resend.dev>";
  const apiKey = process.env.RESEND_API_KEY;
  const results: { user_id: string; items: number; status: string }[] = [];

  for (const [userId, b] of perUser) {
    b.pay.sort((x, y) => x.sort - y.sort);
    b.collect.sort((x, y) => x.sort - y.sort);
    const items = b.pay.length + b.collect.length;

    const { data: u } = await admin.auth.admin.getUserById(userId);
    const email = u?.user?.email;
    if (!email) {
      results.push({ user_id: userId, items, status: "sin correo" });
      continue;
    }
    if (dry || !apiKey) {
      results.push({ user_id: userId, items, status: dry ? "dry-run" : "RESEND_API_KEY ausente" });
      continue;
    }

    const subject = b.pay.some((p) => p.days <= 0) ? `Ledger · ${items} pendiente${items > 1 ? "s" : ""} hoy o vencido${items > 1 ? "s" : ""}` : `Ledger · ${items} vencimiento${items > 1 ? "s" : ""} próximo${items > 1 ? "s" : ""}`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: email, subject, html: buildEmail(b.pay, b.collect, site) }),
    });
    results.push({ user_id: userId, items, status: r.ok ? "enviado" : `error ${r.status}: ${(await r.text()).slice(0, 200)}` });
  }

  return NextResponse.json({ ok: true, dry, users: perUser.size, results });
}
