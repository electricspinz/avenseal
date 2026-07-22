import Link from "next/link";

export function Brand({ dark = false, admin = false }: { dark?: boolean; admin?: boolean }) {
  return (
    <Link href="/" className="focus-ring inline-flex items-center gap-3 rounded-md">
      <span className="relative flex h-9 w-8 items-end justify-center" aria-hidden="true">
        <span className={dark ? "absolute bottom-0 left-0 h-8 w-3 skew-x-[-18deg] rounded-sm bg-white" : "absolute bottom-0 left-0 h-8 w-3 skew-x-[-18deg] rounded-sm bg-navy"} />
        <span className={dark ? "absolute bottom-0 right-0 h-8 w-3 skew-x-[18deg] rounded-sm bg-white" : "absolute bottom-0 right-0 h-8 w-3 skew-x-[18deg] rounded-sm bg-navy"} />
        <span className="absolute bottom-0 h-2.5 w-2.5 rounded-sm bg-emeraldAction" />
      </span>
      <span className={dark ? "text-white" : "text-navy"}>
        <span className="block text-2xl font-semibold leading-6 tracking-normal">Avenseal</span>
        <span className="block text-xs font-medium text-slateDeep/75">{admin ? "Admin" : "Trust Every Signature."}</span>
      </span>
    </Link>
  );
}
