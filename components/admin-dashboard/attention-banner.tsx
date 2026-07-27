import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { AttentionItem } from "@/components/admin-dashboard/dashboard-helpers";

export function AttentionBanner({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-7 rounded-lg border border-amber-300 bg-amber-50 p-5" aria-labelledby="attention-heading">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-800" size={20} aria-hidden="true" />
        <div>
          <h2 id="attention-heading" className="font-semibold text-amber-950">Items requiring attention</h2>
          <ul className="mt-3 space-y-3">
            {items.map((item) => (
              <li key={item.id} className="text-sm leading-6 text-amber-950">
                <span className="font-semibold">{item.title}</span> {item.description} {" "}
                <Link href={item.href} className="focus-ring font-semibold underline underline-offset-4">Open settings</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
