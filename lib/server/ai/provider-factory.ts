import { DeterministicProvider } from "@/lib/server/ai/deterministic-provider";
import type { AIProvider } from "@/lib/server/ai/provider";

export function getAIProvider(): AIProvider {
  return new DeterministicProvider();
}
