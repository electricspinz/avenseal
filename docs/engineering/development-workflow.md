# Development Workflow

1. Start from current `main`.
2. Read the roadmap, applicable PRD, and ADRs.
3. Create a narrowly scoped feature branch.
4. Inspect repository conventions and existing boundaries.
5. Implement migrations and application changes together where needed.
6. Add unit, integration, and E2E tests appropriate to risk.
7. Apply migrations only to staging during development.
8. Verify local and remote migration alignment.
9. Run the validation suite.
10. Open a focused PR and review high-risk tenant, security, migration, and provider paths.
11. Merge only after CI passes.
12. Update milestones, release notes, ADRs, and technical debt.

Codex must not merge automatically unless explicitly instructed. Do not use production for development validation.
