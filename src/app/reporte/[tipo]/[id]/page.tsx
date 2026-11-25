"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buildLoanReport, buildObligationReport, buildRentalReport, type Report } from "@/lib/reports";
import type { Lent, Obligation, PaymentLog, Rental, RentalPayment, Repayment } from "@/lib/types";
import { ReportView } from "@/components/report-view";

export default function ReportPage() {
  const { tipo, id } = useParams<{ tipo: string; id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createClient();
      try {
        let r: Report | null = null;
        if (tipo === "obligacion") {
          const { data: o } = await sb.from("obligations").select("*").eq("id", id).maybeSingle();
          if (o) {
            const { data: logs } = await sb.from("payment_logs").select("*").eq("obligation_id", id).order("paid_at");
            r = buildObligationReport(o as Obligation, (logs as PaymentLog[]) ?? []);
          }
        } else if (tipo === "prestamo") {
          const { data: l } = await sb.from("lent_money").select("*").eq("id", id).maybeSingle();
          if (l) {
            const { data: reps } = await sb.from("lent_repayments").select("*").eq("lent_id", id).order("received_at");
            r = buildLoanReport(l as Lent, (reps as Repayment[]) ?? []);
          }
        } else if (tipo === "alquiler") {
          const { data: rt } = await sb.from("rentals").select("*").eq("id", id).maybeSingle();
          if (rt) {
            const { data: pays } = await sb.from("rental_payments").select("*").eq("rental_id", id).order("received_at");
            r = buildRentalReport(rt as Rental, (pays as RentalPayment[]) ?? []);
          }
        }
        if (cancelled) return;
        if (r) setReport(r);
        else setError("No se encontró el elemento. Puede haber sido eliminado.");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo generar el informe.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tipo, id]);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-danger">{error}</p>
        <button onClick={() => router.back()} className="mt-4 text-sm underline">
          Volver
        </button>
      </div>
    );
  }
  if (!report) return <p className="px-4 py-16 text-center text-sm text-muted-foreground">Generando informe…</p>;
  return <ReportView report={report} onBack={() => router.back()} />;
}
