// Thin client over the Studio tools router (POST /api/tools/call). When the
// plugin is embedded in Studio the dist is served same-origin, so the relative
// path reaches the server directly. Standalone dev relies on the vite proxy.
//
// caller.kind = 'user': these are human-driven UI calls, so the exposedToAI /
// confirm gates in the server registry do not apply.

export interface ToolResultOk<T> {
  ok: true;
  result: T;
}

export interface ToolResultErr {
  ok: false;
  error: string;
  code?: string;
}

export type ToolResult<T> = ToolResultOk<T> | ToolResultErr;

export async function callTool<T>(toolId: string, args: unknown): Promise<ToolResult<T>> {
  let resp: Response;
  try {
    resp = await fetch('/api/tools/call', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toolId, args, caller: { kind: 'user' } }),
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message, code: 'network_error' };
  }
  const body = (await resp.json().catch(() => null)) as ToolResult<T> | null;
  if (!body) return { ok: false, error: `bad response (${resp.status})`, code: 'bad_response' };
  return body;
}
