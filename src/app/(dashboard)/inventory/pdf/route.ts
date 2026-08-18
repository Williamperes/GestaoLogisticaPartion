import { getCurrentUserContext } from "@/lib/auth/session";
import { listEquipment } from "@/lib/inventory";
import { generateInventoryPdf } from "@/lib/inventory-pdf";

export const runtime = "nodejs";

const PDF_ROLES = new Set(["super_admin", "admin", "operations"]);

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context) {
    return new Response("Não autenticado.", { status: 401 });
  }
  if (!context.role || !PDF_ROLES.has(context.role)) {
    return new Response("Sem permissão para acessar o inventário.", { status: 403 });
  }

  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) {
    return new Response("Organização não encontrada.", { status: 400 });
  }

  const generatedAt = new Date();
  const items = await listEquipment(organizationId);
  const bytes = await generateInventoryPdf(items, generatedAt);
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(generatedAt);

  return new Response(body.buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="inventario-completo-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
