# Coding Standards

## Purpose

Summarize the repository's working engineering standards for maintainers.

**Status:** Current working reference
**Last Updated:** 2026-08-08

## Current standards

- Use strict TypeScript and validate untrusted input with Zod.
- Keep server-only credentials and service-role access out of browser components.
- Prefer server components by default; use client components for required interaction.
- Keep API routes thin and use server repository/workflow boundaries.
- Preserve tenant ownership checks, current authorization rules, and customer-safe errors.
- Treat deployed database migrations as append-only.
- Add focused tests for changed behavior and run typecheck, lint, unit tests, and build.

## Source of truth

The detailed [Codex Playbook](../04-development/codex-playbook.md) and repository engineering documents take precedence over this handbook summary.

## Related

- [Testing Strategy](../engineering/testing-strategy.md)
- [Deployment](./Deployment.md)
