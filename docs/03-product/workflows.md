# Workflow Engine

The provider-neutral Workflow Engine models notarization lifecycle state without executing work. Typed stages progress deterministically from appointment scheduled through payment, documents, identity, notarization, follow-up, and closure. Typed blockers and recommended next actions describe—not perform—the next step.

Workflow records are tenant scoped by organization/customer/appointment identity. The current in-memory query is intentionally empty until a repository-backed workflow read model is approved. Timeline adapters safely emit workflow started, stage changed, completed, and closed facts; Mission Control and Operations Feed remain unavailable rather than inventing workflow aggregates. AI may advise in the future but never changes workflow state directly.
