"use client";

import React from "react";
import { AdminShell } from "@/components/admin-shell";
import { DashboardErrorState } from "@/components/mission-control/dashboard-widgets";

export default function AdminDashboardError() { return <AdminShell active="Dashboard"><DashboardErrorState /></AdminShell>; }
