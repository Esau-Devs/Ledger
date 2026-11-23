"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Obligation } from "@/lib/types";
import { LentForm } from "./lent-form";
import { Modal } from "./ui";
import { PaymentForm } from "./payment-form";

/** Acción rápida (FAB "+"): registrar un pago o un préstamo en pocos toques. */
export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"pago" | "prestamo">("pago");
  const [obligations, setObligations] = useState<Obligation[]>([]);

  useEffect(() => {
    if (!open) return;
    createClient()
      .from("obligations")
      .select("*")
      .eq("status", "active")
      .order("next_due_date")
      .then(({ data }) => setObligations((data as Obligation[]) ?? []));
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Registro rápido">
      <div className="mb-4 grid grid-cols-2 rounded-md border border-border bg-muted p-0.5 text-sm">
        {(["pago", "prestamo"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("rounded py-1.5 font-medium transition-colors", tab === t ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {t === "pago" ? "Pago" : "Préstamo"}
          </button>
        ))}
      </div>
      {tab === "pago" ? <PaymentForm obligations={obligations} onDone={onClose} /> : <LentForm onDone={onClose} />}
    </Modal>
  );
}
