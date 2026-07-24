# Technical Debt

This backlog records intentional short-term tradeoffs, operational gaps, and maintenance work. It is not a defect list: each entry explains risk and the recommended resolution. Use [backlog.md](backlog.md) and update status when resolved.

The communications scheduler is now defined in GitHub Actions, but its production deployment remains dependent on configuring matching processor secrets in GitHub and the deployed application. See [the scheduler guide](../engineering/communications-scheduler.md).
