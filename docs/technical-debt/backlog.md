# Technical Debt Backlog

| ID | Title | Area | Impact | Risk | Priority | Status | Introduced by | Recommended resolution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TD-001 | Calendar retry is not scheduled | Google integrations | Manual recovery | Medium | P1 | Open | PR #10 | Add guarded scheduled processor |
| TD-002 | Retry uses protected endpoint | Google integrations | Operator action required | Low | P2 | Accepted tradeoff | PR #10 | Replace after scheduler exists |
| TD-003 | GoTrue multiple-client warning | Integration tests | Test noise | Low | P2 | Open | Staging tests | Consolidate test clients where safe |
| TD-004 | Legacy duration fallback | Appointments | Ambiguous history fallback | Medium | P2 | Accepted tradeoff | PR #9 | Resolve only with defensible data |
| TD-005 | Communications scheduler deployment absent | Communications | Worker needs external invocation | Medium | P1 | Open | Communications worker | Configure a production scheduler |
| TD-006 | Monitoring and alerting informal | Operations | Slow incident detection | High | P1 | Open | Platform foundation | Define alerts and ownership |
| TD-007 | Webhook replay tooling incomplete | Payments | Recovery effort | Medium | P1 | Open | Stripe foundation | Add authenticated replay workflow |
| TD-008 | Provider delivery reconciliation | Communications | Delivery uncertainty | Medium | P1 | Open | PR #11 | Persist/reconcile provider events |
| TD-009 | Retention and deletion procedures | Privacy | Unclear lifecycle | High | P1 | Open | Platform foundation | Define policy and workflows |
| TD-010 | Incident response documentation | Operations | Inconsistent response | Medium | P2 | Open | Platform foundation | Create runbooks |
| TD-011 | Booking concurrency load testing | Availability | Capacity unknown | Medium | P1 | Open | Availability engine | Add realistic contention tests |
