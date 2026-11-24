import { MPLUS_ROUNDED_BASE64, ELECTROLIZE_DIGITS_BASE64 } from "./fonts";

/** ページを再取得する間隔(秒)。入退室から表示までの遅延を 10 秒以内に収める。 */
export const DISPLAY_REFRESH_SECONDS = 5;

export interface DisplaySnapshot {
  /** 現在の入室人数 */
  count: number;
  /** 表示用の更新時刻(JST, HH:MM) */
  updatedAt: string;
}

const clockFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatClock(date: Date): string {
  // ja-JP は "09:05" 形式で返す。環境差を避けるため数字部分だけ取り出して整形する
  const parts = clockFormatter.formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/**
 * 電子ペーパー(DPT-S1)向けの静的な HTML を返す。
 *
 * - 白地に黒のみ。階調・影・アニメーション・透過を使わない
 * - 古い WebKit でも動くよう ES5 の XMLHttpRequest だけを使う
 * - 値が変わったときだけ DOM を書き換え、不要な再描画(ゴースト・フラッシュ)を避ける
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
  min-height: 100%;
}
.sheet {
  box-sizing: border-box;
  max-width: 900px;
  margin: 0 auto;
  padding: 64px 32px;
  text-align: center;
}
.label {
  margin: 0;
  padding: 0 0 28px;
  font-size: 36px;
  font-weight: 500;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  border-bottom: 2px solid #000;
}
.value {
  margin: 0;
  padding: 96px 0 80px;
  border-bottom: 1px solid #000;
  line-height: 1;
  white-space: nowrap;
}
.number {
  font-family: "Electrolize", "M PLUS Rounded 1c", sans-serif;
  font-size: 280px;
  font-size: 34vw;
  font-weight: 400;
}
.unit { font-size: 56px; padding-left: 20px; }
.foot {
  margin: 0;
  padding-top: 28px;
  font-size: 26px;
  letter-spacing: 0.1em;
}
.stale { font-weight: 500; }
</style>
</head>
<body>
<main class="sheet">
<h1 class="label">入室人数</h1>
<p class="value"><span id="count" class="number">${snapshot.count}</span><span class="unit">人</span></p>
<p class="foot">更新 <span id="clock">${snapshot.updatedAt}</span><span id="stale" class="stale"></span></p>
</main>
<script>
(function () {
  var url = ${countUrl};
  var interval = ${interval * 1000};
  var countEl = document.getElementById("count");
  var clockEl = document.getElementById("clock");
  var staleEl = document.getElementById("stale");

  function setText(el, text) {
    if (el.firstChild && el.firstChild.nodeValue === text) return;
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
        setText(clockEl, data.updatedAt);
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
