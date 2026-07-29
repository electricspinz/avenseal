import React, { type ReactNode } from "react";

export function MissionControlEmptyState({ children }: { children: ReactNode }) {
  return <p className="mt-5 rounded-md border border-dashed border-silver bg-mist/60 p-5 text-sm leading-6 text-slateDeep">{children}</p>;
}
