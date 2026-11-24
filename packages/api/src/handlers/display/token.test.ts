import { describe, expect, it } from "vitest";

import { isValidDisplayToken } from "./token";

const TOKEN = "a".repeat(64);

describe("isValidDisplayToken", () => {
  it("一致するトークンを受け入れる", async () => {
    await expect(isValidDisplayToken(TOKEN, TOKEN)).resolves.toBe(true);
  });

  it("異なるトークンを拒否する", async () => {
    await expect(isValidDisplayToken("b".repeat(64), TOKEN)).resolves.toBe(false);
    await expect(isValidDisplayToken("a".repeat(63), TOKEN)).resolves.toBe(false);
    await expect(isValidDisplayToken("", TOKEN)).resolves.toBe(false);
  });

  it("期待値が未設定なら、空文字を含めて常に拒否する", async () => {
    await expect(isValidDisplayToken(TOKEN, undefined)).resolves.toBe(false);
    await expect(isValidDisplayToken("", undefined)).resolves.toBe(false);
    await expect(isValidDisplayToken("", "")).resolves.toBe(false);
  });
});
