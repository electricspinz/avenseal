import { NextResponse } from "next/server";
import { requireAdminOrganizationContext, type AdminOrganizationContext } from "@/lib/server/admin-context";
import { repository } from "@/lib/server/repository";

type ArchiveResult = Awaited<ReturnType<typeof repository.setCommunicationArchived>>;

export type CommunicationArchiveDependencies = Readonly<{
  context: () => Promise<AdminOrganizationContext>;
  setArchiveState: (input: { organizationId: string; communicationId: string; actorUserId: string; archived: boolean }) => Promise<ArchiveResult>;
}>;

const production: CommunicationArchiveDependencies = {
  context: requireAdminOrganizationContext,
  setArchiveState: repository.setCommunicationArchived
};

export function createCommunicationArchiveHandler(dependencies: CommunicationArchiveDependencies = production) {
  return async function handle(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
      const [body, { id }, context] = await Promise.all([
        request.json().catch(() => null),
        params,
        dependencies.context()
      ]);
      if (!isArchiveRequest(body)) return NextResponse.json({ error: "Communication archiving is unavailable." }, { status: 400, headers: noStoreHeaders });
      const result = await dependencies.setArchiveState({
        organizationId: context.organizationId,
        communicationId: id,
        actorUserId: context.userId,
        archived: body.archived
      });
      if (!result) return NextResponse.json({ error: "Communication not found." }, { status: 404, headers: noStoreHeaders });
      return NextResponse.json({ archived: result.archivedAt !== null }, { headers: noStoreHeaders });
    } catch {
      return NextResponse.json({ error: "Communication archiving is unavailable." }, { status: 403, headers: noStoreHeaders });
    }
  };
}

const noStoreHeaders = { "Cache-Control": "no-store" };

function isArchiveRequest(value: unknown): value is { archived: boolean } {
  return typeof value === "object" && value !== null && "archived" in value && typeof value.archived === "boolean";
}
