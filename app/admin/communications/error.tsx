"use client";

import React from "react";
import { AdminShell } from "@/components/admin-shell";
import { CommunicationsErrorState } from "@/components/communications-center";

export default function CommunicationsError() { return <AdminShell active="Communications"><CommunicationsErrorState /></AdminShell>; }
