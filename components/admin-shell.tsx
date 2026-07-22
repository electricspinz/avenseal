import Link from "next/link";
import { Brand } from "@/components/brand";
import { icons } from "@/components/icons";
import { cn } from "@/lib/utils";

const nav = [
  ["Dashboard", "/admin", icons.monitor],
  ["Appointments", "/admin/appointments", icons.calendar],
  ["Customers", "/admin/customers", icons.users],
  ["Settings", "/admin/settings", icons.lock]
] as const;

export function AdminShell({ children, active }: { children: React.ReactNode; active: string }) {
  return (
    <main className="min-h-screen bg-mist lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="bg-navy p-6 text-white">
        <Brand dark admin />
        <nav className="mt-10 flex gap-2 overflow-x-auto lg:block lg:space-y-2" aria-label="Admin navigation">
          {nav.map(([label, href, Icon]) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "focus-ring flex min-w-max items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold text-white/76 hover:bg-white/10 hover:text-white",
                active === label && "bg-white/12 text-white"
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <p className="mt-10 rounded-md border border-white/18 p-4 text-xs leading-5 text-white/68">
          Development data is clearly marked and should not be represented as live business performance.
        </p>
      </aside>
      <section className="p-5 lg:p-8">{children}</section>
    </main>
  );
}

export function AdminCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-silver bg-white p-5 shadow-sm", className)}>{children}</div>;
}

