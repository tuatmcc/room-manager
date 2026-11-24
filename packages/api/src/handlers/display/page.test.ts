import { describe, expect, it } from "vitest";

import { formatClock, renderDisplayPage } from "./page";

describe("formatClock", () => {
  it("JST の HH:MM に整形する", () => {
    expect(formatClock(new Date("2026-11-24T00:05:00Z"))).toBe("09:05");
    expect(formatClock(new Date("2026-11-24T15:00:00Z"))).toBe("00:00");
  });
});

describe("renderDisplayPage", () => {
  const html = renderDisplayPage({ count: 3, updatedAt: "12:34" }, "/display/abc/count");

  it("入室人数と更新時刻を初期描画に含める", () => {
    expect(html).toContain('<span id="count" class="number">3</span>');
    expect(html).toContain('<span id="clock">12:34</span>');
  });

  it("ハンドルネームなど人数以外の情報を含めない", () => {
    expect(html).not.toMatch(/discord/i);
  });

  it("フォントを埋め込み、外部へ通信しない(端末は TLS 1.2 以上に接続できない)", () => {
    expect(html).toContain('font-family: "Electrolize"');
    expect(html).toContain('font-family: "M PLUS Rounded 1c"');
    expect(html).toContain("url(data:font/ttf;base64,");
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("JavaScript 無効時の meta refresh を持つ", () => {
    expect(html).toMatch(/<noscript><meta http-equiv="refresh" content="5"><\/noscript>/);
  });

  it("取得先 URL を JSON 文字列として埋め込み、スクリプトを閉じられない", () => {
    const evil = renderDisplayPage({ count: 0, updatedAt: "00:00" }, "/x</script><b>");
    expect(evil).not.toContain("</script><b>");
    expect(evil).toContain("\\u003c/script>");
  });
});
