import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-emeraldAction text-white shadow-sm hover:bg-[#239c62]",
  secondary: "border border-navy/55 bg-white text-navy hover:bg-mist",
  navy: "bg-navy text-white hover:bg-[#0b2035]",
  ghost: "text-navy hover:bg-mist"
};

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof variants }) {
  return (
    <Link
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center rounded-md px-6 text-sm font-semibold transition",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof variants }) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center rounded-md px-6 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

