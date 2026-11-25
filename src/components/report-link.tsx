import Link from "next/link";
import { FileText } from "lucide-react";

/** Botón de icono que abre el informe imprimible/descargable de una deuda, suscripción, préstamo o alquiler. */
export function ReportLink({ tipo, id }: { tipo: "obligacion" | "prestamo" | "alquiler"; id: string }) {
  return (
    <Link
      href={`/reporte/${tipo}/${id}`}
      aria-label="Ver informe"
      title="Informe"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FileText className="h-4 w-4" />
    </Link>
  );
}
