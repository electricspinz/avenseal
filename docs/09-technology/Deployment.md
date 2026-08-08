# Deployment

## Purpose

Document deployment expectations without exposing infrastructure credentials or asserting unverified production configuration.

**Status:** Current working reference
**Last Updated:** 2026-08-08

## Repository evidence

The project is built as a Next.js application and includes GitHub Actions workflows for CI and operational processing. The project documentation and deployment conventions reference Vercel and Supabase. CI validates type checking, linting, unit tests, and build.

## Deployment principles

Deploy from reviewed source, configure environment values outside source control, validate migrations separately and append-only, and confirm public URLs and internal jobs in the target environment. Never place service-role keys, provider keys, signing secrets, or customer data in documentation or client code.

## To Be Finalized

Authoritative environment inventory, production/staging ownership, rollback procedures, backup evidence, uptime monitoring, and deployment-protection policy.

## Related

- [Environment Overview](./Environment-Overview.md)
- [Coding Standards](./Coding-Standards.md)
