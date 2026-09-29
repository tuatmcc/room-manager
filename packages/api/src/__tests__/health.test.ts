import type { KVNamespace } from "@cloudflare/workers-types";
import { describe, expect, it, vi } from "vitest";

import type { Env } from "../env";
import { checkDependencies } from "../index";

function createEnv(databaseResult: { ok: number } | null) {
  const first = vi.fn().mockResolvedValue(databaseResult);
  const prepare = vi.fn().mockReturnValue({ first });
  const get = vi.fn().mockResolvedValue(null);

  return {
    env: {
      DB: { prepare } as unknown as D1Database,
      KV: { get } as unknown as KVNamespace,
    } as Env,
    first,
    get,
    prepare,
  };
}

describe("checkDependencies", () => {
  it("checks both D1 and KV", async () => {
    const { env, first, get, prepare } = createEnv({ ok: 1 });

    await expect(checkDependencies(env)).resolves.toBeUndefined();

    expect(prepare).toHaveBeenCalledWith("SELECT 1 AS ok");
    expect(first).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith("__room_manager_healthcheck__");
  });

  it("rejects an unexpected D1 result before checking KV", async () => {
    const { env, get } = createEnv(null);

    await expect(checkDependencies(env)).rejects.toThrow("D1 health check");
    expect(get).not.toHaveBeenCalled();
  });
});
