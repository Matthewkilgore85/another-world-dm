import { dmStatus, LLMDM } from './llmDM';
import type { DMProvider } from './provider';
import { StubDM } from './stubDM';

/** Synchronous default used until the proxy status check resolves (and whenever no key is configured). */
export function getStubDM(): DMProvider {
  return new StubDM();
}

/**
 * Single place to swap the DM. Uses the LLMDM (xAI or Groq via the proxy) when the local proxy reports a key
 * (GET /api/dm/status → { configured: true }); otherwise the offline StubDM.
 */
export async function getDM(): Promise<DMProvider> {
  const s = await dmStatus();
  return s.configured ? new LLMDM({ model: s.model, provider: s.provider }) : new StubDM();
}
export type { DMProvider } from './provider';
