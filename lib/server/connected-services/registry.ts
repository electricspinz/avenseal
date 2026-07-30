import type { ConnectedServiceAdminItem, ConnectedServiceCategory, ConnectedServiceContext, ConnectedServiceProvider, ProviderCapability, ProviderConfigurationState, ProviderError, ProviderErrorCode } from "@/lib/server/connected-services/types";

export class ConnectedServiceRegistry {
  private readonly providers = new Map<string, ConnectedServiceProvider>();

  register(provider: ConnectedServiceProvider) {
    if (this.providers.has(provider.id)) throw new Error(`Connected Service provider "${provider.id}" is already registered.`);
    this.providers.set(provider.id, provider);
  }

  resolve(providerId: string, category?: ConnectedServiceCategory) {
    const provider = this.providers.get(providerId) ?? null;
    return provider && (!category || provider.category === category) ? provider : null;
  }

  discover(category?: ConnectedServiceCategory) { return [...this.providers.values()].filter((provider) => !category || provider.category === category); }
  capabilities(providerId: string): readonly ProviderCapability[] { return this.resolve(providerId)?.capabilities ?? []; }

  async adminReadModel(context: ConnectedServiceContext, configurationState: (provider: ConnectedServiceProvider, context: ConnectedServiceContext) => ProviderConfigurationState = () => "not_configured"): Promise<readonly ConnectedServiceAdminItem[]> {
    const providers = this.discover();
    const statuses = await Promise.all(providers.map(async (provider) => ({ provider, result: await safeStatus(provider, context) })));
    return statuses.map(({ provider, result }) => ({ id: provider.id, category: provider.category, name: provider.displayName, version: provider.version, description: provider.description, capabilities: [...provider.capabilities], status: result.status, configurationState: configurationState(provider, context), checkedAt: result.checkedAt, detail: result.detail }));
  }
}

async function safeStatus(provider: ConnectedServiceProvider, context: ConnectedServiceContext) {
  try { return await provider.getStatus(context); }
  catch { return { status: "unknown" as const, checkedAt: null, detail: "Provider status could not be determined." }; }
}

export function normalizeProviderError(error: unknown, providerId?: string): ProviderError {
  if (isProviderError(error)) return { ...error, ...(providerId ? { providerId } : {}) };
  const name = error instanceof Error ? error.name : undefined;
  const message = error instanceof Error && safeMessage(error.message) ? error.message : "The connected service could not complete the request.";
  const code: ProviderErrorCode = name === "TimeoutError" ? "timeout" : name === "TypeError" ? "validation" : "unknown";
  return { code, message, retryable: code === "timeout" || code === "unknown", ...(providerId ? { providerId } : {}), ...(name ? { causeName: name } : {}) };
}

function isProviderError(value: unknown): value is ProviderError { return typeof value === "object" && value !== null && "code" in value && "message" in value && "retryable" in value; }
function safeMessage(value: string) { return value.length > 0 && value.length <= 240 && !/secret|token|authorization|password/i.test(value); }
