# Technology Architecture Overview

## Purpose

Describe the repository's current architecture at a safe, high level.

**Status:** Current working reference
**Last Updated:** 2026-08-08

## Current implementation

Avenseal is a Next.js App Router application using React, TypeScript, Tailwind CSS, Zod validation, Supabase, and pnpm. Public pages and booking experiences live under `app/`; shared presentation lives in `components/`; server-only workflows and persistence are concentrated under `lib/server/`.

## Boundaries

API routes validate inputs before using server workflows. The repository layer coordinates persistence and business workflows. Supabase service-role access remains server-only. Tenant-owned data is organization-scoped. The repository also contains boundaries for payments, communications, Google Calendar, Client Workspace access, external sessions, document storage/security, automation, and operational dashboards.

## Security model at a high level

Admin authentication and organization context are server-enforced, with middleware providing route protection and route handlers retaining authorization responsibility. Do not treat this summary as a security certification or an operational runbook.

## Related

- [Deployment](./Deployment.md)
- [Integrations](./Integrations.md)
- [Architecture reference](../architecture/overview.md)
