const encoder = new TextEncoder();

async function sha256(value: string): Promise<ArrayBuffer> {
  return await crypto.subtle.digest("SHA-256", encoder.encode(value));
}

/** 同じ長さのバイト列を、差異の位置に依らない時間で比較する。 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * 表示用トークンを定数時間で比較する。
 * 長さの違いが漏れないよう、SHA-256 を取ってから比較する。
 * 期待値が未設定(空)の場合は常に不一致とする。
 */
export async function isValidDisplayToken(
  provided: string,
  expected: string | undefined,
): Promise<boolean> {
  if (!expected) return false;

  const [providedHash, expectedHash] = await Promise.all([sha256(provided), sha256(expected)]);
  return constantTimeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash));
}
