import { describe, expect, it } from "vitest";

import { renderDisplayPage } from "./page";

describe("renderDisplayPage", () => {
  const html = renderDisplayPage({ count: 3 }, "/display/abc/count");

  it("入室人数を初期描画に含める", () => {
    expect(html).toContain('<span id="count" class="number">3</span>');
  });

  it("時計を表示しない", () => {
    expect(html).not.toContain('id="clock"');
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

  it("ロゴを data URI の画像として埋め込む", () => {
    expect(html).toMatch(
      /<img src="data:image\/png;base64,[A-Za-z0-9+/=]+" width="\d+" height="\d+" alt="MCC">/,
    );
  });

  it("JavaScript 無効時の meta refresh を持つ", () => {
    expect(html).toMatch(/<noscript><meta http-equiv="refresh" content="5"><\/noscript>/);
  });

  it("取得先 URL を JSON 文字列として埋め込み、スクリプトを閉じられない", () => {
    const evil = renderDisplayPage({ count: 0 }, "/x</script><b>");
    expect(evil).not.toContain("</script><b>");
    expect(evil).toContain("\\u003c/script>");
  });
});
