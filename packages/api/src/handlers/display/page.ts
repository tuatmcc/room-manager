import { MPLUS_ROUNDED_BASE64, ELECTROLIZE_DIGITS_BASE64 } from "./fonts";
import { MCC_LOGO_HEIGHT, MCC_LOGO_PNG_BASE64, MCC_LOGO_WIDTH } from "./logo";

/** ページを再取得する間隔(秒)。入退室から表示までの遅延を 10 秒以内に収める。 */
export const DISPLAY_REFRESH_SECONDS = 5;

export interface DisplaySnapshot {
  /** 現在の入室人数 */
  count: number;
  /** `/room display` で登録された文字列。未登録なら空文字列 */
  message: string;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 電子ペーパー(DPT-S1)向けの静的な HTML を返す。
 *
 * - 白地に黒のみ。階調・影・アニメーション・透過を使わない
 * - 古い WebKit でも動くよう ES5 の XMLHttpRequest だけを使う
 * - 値が変わったときだけ DOM を書き換え、不要な再描画(ゴースト・フラッシュ)を避ける
 * - 「人が入室中」の下に `/room display` で登録された文字列を出す。
 *   任意の文字を受け付けるため、埋め込みフォントのサブセットではなく端末の日本語フォントで描画する
 * - JavaScript が無効でも meta refresh で更新される
 */
export function renderDisplayPage(snapshot: DisplaySnapshot, countPath: string): string {
  const countUrl = JSON.stringify(countPath).replaceAll("<", "\\u003c");
  const interval = DISPLAY_REFRESH_SECONDS;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>部室</title>
<noscript><meta http-equiv="refresh" content="${interval}"></noscript>
<style>
@font-face {
  font-family: "Electrolize";
  font-weight: 400;
  src: url(data:font/ttf;base64,${ELECTROLIZE_DIGITS_BASE64}) format("truetype");
}
@font-face {
  font-family: "M PLUS Rounded 1c";
  font-weight: 500;
  src: url(data:font/ttf;base64,${MPLUS_ROUNDED_BASE64}) format("truetype");
}
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body {
  font-family: "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif;
  font-weight: 500;
}
.sheet {
  box-sizing: border-box;
  max-width: 1200px;
  margin: 0 auto;
  padding: 56px 48px;
  padding: 5vw 6vw;
}
.logo { margin: 0; text-align: center; }
.logo img { width: 60%; height: auto; }
.lead {
  margin: 0;
  padding-top: 64px;
  padding-top: 8vw;
  font-size: 56px;
  font-size: 6vw;
  letter-spacing: 0.1em;
}
.value {
  margin: 0;
  text-align: center;
  line-height: 1;
  white-space: nowrap;
}
.number {
  font-family: "Electrolize", "M PLUS Rounded 1c", sans-serif;
  font-size: 360px;
  font-size: 40vw;
  font-weight: 400;
}
.unit {
  margin: 0;
  text-align: right;
  font-size: 56px;
  font-size: 6vw;
  letter-spacing: 0.1em;
}
.message {
  margin: 0;
  padding-top: 48px;
  padding-top: 6vw;
  text-align: center;
  font-family: "Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif;
  font-size: 56px;
  font-size: 6vw;
  line-height: 1.3;
  word-break: break-all;
}
.stale { margin: 0; padding-top: 16px; text-align: center; font-size: 28px; font-size: 3vw; }
</style>
</head>
<body>
<main class="sheet">
<h1 class="logo"><img src="data:image/png;base64,${MCC_LOGO_PNG_BASE64}" width="${MCC_LOGO_WIDTH}" height="${MCC_LOGO_HEIGHT}" alt="MCC"></h1>
<p class="lead">ただいま</p>
<p class="value"><span id="count" class="number">${snapshot.count}</span></p>
<p class="unit">人が入室中</p>
<p class="message" id="message">${escapeHtml(snapshot.message)}</p>
<p class="stale" id="stale"></p>
</main>
<script>
(function () {
  var url = ${countUrl};
  var interval = ${interval * 1000};
  var countEl = document.getElementById("count");
  var messageEl = document.getElementById("message");
  var staleEl = document.getElementById("stale");

  function setText(el, text) {
    if (el.firstChild ? el.firstChild.nodeValue === text : text === "") return;
    el.innerHTML = "";
    el.appendChild(document.createTextNode(text));
  }

  function schedule() {
    setTimeout(poll, interval);
  }

  function poll() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url + "?t=" + new Date().getTime(), true);
    xhr.timeout = 8000;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      try {
        if (xhr.status !== 200) throw new Error("status " + xhr.status);
        var data = JSON.parse(xhr.responseText);
        setText(countEl, String(data.count));
        setText(messageEl, typeof data.message === "string" ? data.message : "");
        setText(staleEl, "");
      } catch (e) {
        setText(staleEl, "(更新できません)");
      }
      schedule();
    };
    xhr.send();
  }

  schedule();
})();
</script>
</body>
</html>
`;
}
