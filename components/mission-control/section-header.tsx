import React, { type ReactNode } from "react";

export function SectionHeader({ id, title, action }: { id: string; title: string; action?: ReactNode }) {
  return <div className="flex items-center justify-between gap-4"><h2 id={id} className="text-xl font-semibold text-navy">{title}</h2>{action}</div>;
}
