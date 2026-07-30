"use client";

import { AdminShell, AdminCard } from "@/components/admin-shell";

export default function AvenCopilotError() { return <AdminShell active="Aven"><AdminCard><p role="alert" className="text-sm leading-6 text-slateDeep">Aven could not prepare the operations brief.</p></AdminCard></AdminShell>; }
