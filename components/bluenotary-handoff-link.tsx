"use client";

import type { ComponentProps } from "react";
import { trackBlueNotaryHandoff } from "@/lib/analytics";

export function BlueNotaryHandoffLink({ onClick, ...props }: ComponentProps<"a">) {
  return <a {...props} onClick={(event) => { trackBlueNotaryHandoff(); onClick?.(event); }} />;
}
