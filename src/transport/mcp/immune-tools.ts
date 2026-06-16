/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

import { GovernanceCore } from "../governance-core.js";

export async function handleImmuneCycle(core: GovernanceCore): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const result = await core.runImmuneCycle();
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: String(e), code: -32603, retryable: true }) }] };
  }
}

export async function handleImmuneStats(core: GovernanceCore): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const stats = await core.getImmuneStats();
    return { content: [{ type: "text", text: JSON.stringify(stats) }] };
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: String(e), code: -32603, retryable: true }) }] };
  }
}
