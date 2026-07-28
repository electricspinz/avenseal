import type { AutomationRegistry, AutomationRule } from "@/lib/server/automation/types";

export class InMemoryAutomationRegistry implements AutomationRegistry {
  private readonly rules = new Map<string, AutomationRule>();

  constructor(rules: readonly AutomationRule[] = []) {
    for (const rule of rules) this.register(rule);
  }

  register(rule: AutomationRule) {
    if (this.rules.has(rule.metadata.id)) {
      throw new Error(`Automation rule "${rule.metadata.id}" is already registered.`);
    }
    this.rules.set(rule.metadata.id, rule);
  }

  get(ruleId: string) {
    return this.rules.get(ruleId) ?? null;
  }
}
