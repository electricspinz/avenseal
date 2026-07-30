import React from "react";
import { AdminShell } from "@/components/admin-shell";
import { CommunicationsLoadingState } from "@/components/communications-center";

export default function CommunicationsLoading() { return <AdminShell active="Communications"><CommunicationsLoadingState /></AdminShell>; }
