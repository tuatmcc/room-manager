import { MPLUS_ROUNDED_BASE64, ELECTROLIZE_DIGITS_BASE64 } from "./fonts";
import { MCC_LOGO_HEIGHT, MCC_LOGO_PNG_BASE64, MCC_LOGO_WIDTH } from "./logo";

/** ページを再取得する間隔(秒)。入退室から表示までの遅延を 10 秒以内に収める。 */
export const DISPLAY_REFRESH_SECONDS = 5;

export interface DisplaySnapshot {
  /** 現在の入室人数 */
  count: number;
  /** 表示用の更新時刻(JST, HH:MM:SS) */
  updatedAt: string;
}

const clockFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatClock(date: Date): string {
  // ja-JP は "09:05:07" 形式で返す。環境差を避けるため数字部分だけ取り出して整形する
  const parts = clockFormatter.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((part) => part.type === type)?.value ?? "00").padStart(2, "0");
  return `${pick("hour")}:${pick("minute")}:${pick("second")}`;
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
.clock {
  margin: 0;
  padding-top: 48px;
  padding-top: 6vw;
  text-align: center;
  font-family: "Electrolize", "M PLUS Rounded 1c", sans-serif;
  font-size: 88px;
  font-size: 10vw;
  font-weight: 400;
  letter-spacing: 0.05em;
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
<p class="clock" id="clock">${snapshot.updatedAt}</p>
<p class="stale" id="stale"></p>
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
