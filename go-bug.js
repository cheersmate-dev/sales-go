/* GO!シリーズ共通：不具合・要望を送るボタン（2026-11-28 GO!シリーズ全体-003）
   Cheers GO! の「不具合・要望を送る」（右下の質問ボタンの中・設定＞サポート）と同じ形を、ほかのアプリでも使えるようにした1ファイル。
   送る先：GO!不具合の受け口（Google Apps Script のウェブアプリ・go-bug-relay.gs）→ 台帳のシートに1行 ＋ Chatwork の不具合ルームへ知らせる。
   鍵は持たない（Chatwork のトークンは受け口のスクリプトのプロパティだけ）。受け口のURLが空なら送らず「見本なので送っていません」。

   使い方（読み込む前に）：
     window.GO_BUG = {
       app: "Sales GO!",              // 知らせの先頭に出るアプリの名前（必須）
       endpoint: "",                  // 受け口のURL（/exec）。空なら見本
       fab: true,                     // 右下に自分のボタンを出すか（Bot ボタンがあるアプリは false にして、Bot の中へ GoBug.row() を置く）
       bottom: "calc(84px + env(safe-area-inset-bottom,0px))",   // 右下のボタンの高さ（タブの上）
       right: "",                     // 右からの位置（画面のまん中に寄せたアプリで使う）
       screen: () => "今日",          // いま開いている画面の名前（無ければ選ばれているタブの文字）
       screens: ["今日", "面談", ...],// 「どの画面？」の選択肢
       who: () => "",                 // 表示名（見本では空）
       demo: false,                   // true なら送らない
       dark: "auto"                   // ダークモード："auto"＝アプリがダークに対応している（color-scheme に dark が入る）ときだけ端末のダークに合わせる／false＝いつもライト
     };
   ほかから開く：GoBug.open("bug")／Bot の中に置く1行：GoBug.row()（押すと開く・data-gobug） */
(function () {
  "use strict";
  const C = Object.assign({app: "GO!", endpoint: "", fab: true, bottom: "calc(84px + env(safe-area-inset-bottom,0px))", screens: [], demo: false}, window.GO_BUG || {});
  const MAX = 2000, KEY = "go-bug-draft:" + C.app;
  const KINDS = [["bug", "不具合", "動かない・おかしい", "M12 3 2 20h20L12 3zM12 10v4M12 17.2v.1"], ["idea", "要望", "こうしてほしい", "M12 2v4M4.9 4.9l2.8 2.8M2 12h4M19.1 4.9l-2.8 2.8M22 12h-4M9 18h6M10 21h4M12 7a5 5 0 0 0-3 9h6a5 5 0 0 0-3-9z"],
    ["ask", "質問・相談", "聞きたいこと", "M4 5h16v11H10l-5 4v-4H4z"], ["other", "その他", "なんでも", "M6 3h9l4 4v14H6zM9 12h7M9 16h5"]];
  const PH = {bug: "何をしたら、どうなったか\n例：「面談」のタブを押すと、白い画面のまま動かない",
    idea: "あったらうれしいこと・直してほしいところ\n例：先週の記録も並べて見たい", ask: "使い方など、聞きたいこと", other: "運営に伝えたいこと"};
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const svg = (d, cls) => `<svg class="${cls || ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICO = {cam: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", send: "M22 2 11 13M22 2l-7 20-4-9-9-4z", x: "M6 6l12 12M18 6 6 18", check: "M5 12.5l4.5 4.5L19 7", chev: "M9 6l6 6-6 6"};
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
  const cid = () => { const a = new Uint8Array(12); try { crypto.getRandomValues(a); } catch (e) { a.forEach((_, i) => a[i] = Math.random() * 256 | 0); } return "gb" + [...a].map(b => b.toString(16).padStart(2, "0")).join(""); };
  const demo = () => C.demo || !C.endpoint;
  const where = () => {
    try { if (typeof C.screen === "function") { const s = C.screen(); if (s) return String(s).slice(0, 40); } } catch (e) {}
    const t = document.querySelector('[role="tab"][aria-selected="true"],.tab[aria-selected="true"],.tabs .on,.nav .on,[aria-current="page"]');
    if (!t) return "";
    const own = [...t.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim();   // 数のバッジ（「今日3」の3）を入れない
    const c = t.cloneNode(true); c.querySelectorAll(".badge,.soon,[hidden],svg").forEach(x => x.remove());
    return (own || c.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
  };
  const S = {open: false, busy: false, sent: null, err: "", auto: "", d: null, restored: false, imgs: [], imgBusy: false};
  const IMG_MAX = 3, IMG_SIDE = 1400;   // スクショは3枚まで・長い辺1400pxのJPEGに縮めて送る（1枚およそ100〜300KB）
  // 写真を縮める：端末の中だけで行う（元の写真は送らない）
  function shrink(file) {
    return new Promise((ok, ng) => {
      if (!/^image\//.test(file.type || "")) return ng(new Error("type"));
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, IMG_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
        const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
        URL.revokeObjectURL(url); ok({url: c.toDataURL("image/jpeg", 0.78), w, h});
      };
      im.onerror = () => { URL.revokeObjectURL(url); ng(new Error("read")); };
      im.src = url;
    });
  }
  async function addImgs(files) {
    const list = [...(files || [])].slice(0, IMG_MAX - S.imgs.length); if (!list.length) return;
    S.imgBusy = true; paint();
    for (const f of list) { try { S.imgs.push(await shrink(f)); } catch (e) { S.err = "画像を読みこめませんでした。写真（PNG・JPEG）を選んでください。"; } }
    S.imgBusy = false; paint();
  }

  /* ---------- 見た目（gb- で始まる名前だけ。アプリの色に寄せるときは --gb-accent などを上書き） ---------- */
  const css = `
  :root{--gb-accent:#0E1F4D;--gb-gold:#F2B705;--gb-ink:#13203F;--gb-sub:#5B6683;--gb-line:#E3E7F0;--gb-card:#fff;--gb-soft:#F5F7FB;--gb-err:#C0392B}
  .gb-fab{position:fixed;right:max(16px,env(safe-area-inset-right,0px));z-index:930;width:54px;height:54px;border-radius:50%;border:0;padding:0;cursor:pointer;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;background:var(--gb-accent);color:#fff;
    box-shadow:0 6px 16px rgba(14,40,80,.22),0 1px 3px rgba(14,40,80,.12);font:700 10px/1 "Noto Sans JP",system-ui,sans-serif;-webkit-tap-highlight-color:transparent;transition:transform .15s}
  .gb-fab:active{transform:scale(.94)}
  .gb-fab svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
  .gb-fab:focus-visible{outline:3px solid var(--gb-gold);outline-offset:3px}
  .gb-row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:1px solid var(--gb-line);background:var(--gb-soft);color:var(--gb-ink);border-radius:14px;padding:12px 14px;margin:0 0 12px;cursor:pointer;font:inherit}
  .gb-row .gb-ib{flex:none;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--gb-gold);color:var(--gb-accent)}
  .gb-row svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .gb-row span{flex:1;min-width:0}.gb-row b{display:block;font-size:15px}.gb-row small{display:block;color:var(--gb-sub);font-size:12px;margin-top:2px}
  .gb-row em{color:var(--gb-sub);font-style:normal}
  .gb-sheet{position:fixed;inset:0;z-index:2000;background:rgba(5,12,35,.5);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .25s;font-family:"Noto Sans JP",system-ui,sans-serif}
  .gb-sheet.in{opacity:1}
  .gb-in{position:relative;width:100%;max-width:560px;max-height:92vh;overflow:auto;background:var(--gb-card);color:var(--gb-ink);border-radius:22px 22px 0 0;
    padding:0 0 calc(18px + env(safe-area-inset-bottom,0px));transform:translateY(40px);transition:transform .28s cubic-bezier(.2,.9,.3,1.1);outline:0}
  .gb-sheet.in .gb-in{transform:none}
  .gb-hero{display:flex;align-items:flex-start;gap:10px;padding:20px 20px 16px;background:linear-gradient(135deg,var(--gb-accent),color-mix(in srgb,var(--gb-accent) 70%,#3a5bd0));color:#fff;border-radius:22px 22px 0 0}
  .gb-hero div{flex:1}.gb-eye{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--gb-gold)}
  .gb-hero h3{margin:4px 0 4px;font-size:20px;font-weight:900}.gb-hero p{margin:0;font-size:13px;opacity:.9;line-height:1.5}
  .gb-x{flex:none;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;display:grid;place-items:center;cursor:pointer}
  .gb-x svg,.gb-send svg,.gb-check svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
  .gb-body{padding:16px 20px 4px}
  .gb-k{display:block;font-size:13px;font-weight:700;margin:14px 0 6px}.gb-k:first-child{margin-top:0}
  .gb-opt{margin-left:6px;font-size:11px;font-weight:400;color:var(--gb-sub)}.gb-req{margin-left:6px;font-size:10px;background:var(--gb-gold);color:var(--gb-accent);padding:2px 6px;border-radius:99px;vertical-align:1px}
  .gb-kinds{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;border:0;padding:0;margin:0}
  .gb-kind span{display:flex;flex-direction:column;align-items:center}.gb-kind{border:1.5px solid var(--gb-line);background:var(--gb-card);color:var(--gb-ink);border-radius:14px;padding:10px 4px 8px;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;font:inherit}
  .gb-kind svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
  .gb-kind b{font-size:13px}.gb-kind small{font-size:10px;color:var(--gb-sub);line-height:1.3;text-align:center}
  .gb-kind[aria-checked="true"]{border-color:var(--gb-accent);background:color-mix(in srgb,var(--gb-gold) 22%,#fff);box-shadow:0 0 0 2px color-mix(in srgb,var(--gb-accent) 18%,transparent)}
  .gb-sel{width:100%;font:inherit;font-size:15px;padding:11px 12px;border:1.5px solid var(--gb-line);border-radius:12px;background:var(--gb-card);color:var(--gb-ink)}
  .gb-hint{font-size:12px;color:var(--gb-sub);margin:6px 0 0}
  .gb-ta{position:relative}.gb-ta textarea{width:100%;box-sizing:border-box;min-height:150px;font:inherit;font-size:16px;line-height:1.6;padding:12px 12px 26px;border:1.5px solid var(--gb-line);border-radius:14px;resize:vertical;color:var(--gb-ink);background:var(--gb-card)}
  .gb-ta textarea:focus,.gb-sel:focus{outline:0;border-color:var(--gb-accent)}
  .gb-count{position:absolute;right:12px;bottom:8px;font-size:11px;color:var(--gb-sub)}.gb-ta.over .gb-count{color:var(--gb-err);font-weight:700}
  .gb-cheer{font-size:12.5px;color:var(--gb-sub);background:var(--gb-soft);border-radius:12px;padding:10px 12px;margin:12px 0 0;line-height:1.6}
  .gb-meta{font-size:11px;color:var(--gb-sub);margin:12px 0;line-height:1.5}
  .gb-err{display:flex;gap:8px;background:#FDECEA;color:var(--gb-err);border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.5;margin-top:12px}
  .gb-send{width:100%;border:0;border-radius:14px;padding:15px;font:inherit;font-size:16px;font-weight:900;background:var(--gb-gold);color:var(--gb-accent);display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}
  .gb-send:disabled{opacity:.45;cursor:default}
  .gb-spin{width:16px;height:16px;border:2.5px solid currentColor;border-right-color:transparent;border-radius:50%;animation:gbspin .8s linear infinite}
  @keyframes gbspin{to{transform:rotate(360deg)}}
  .gb-done{padding:26px 20px 8px;text-align:center}
  .gb-check{width:64px;height:64px;border-radius:50%;margin:0 auto 10px;display:grid;place-items:center;background:var(--gb-gold);color:var(--gb-accent)}
  .gb-check svg{width:32px;height:32px;stroke-width:2.6}
  .gb-done b{font-size:19px}.gb-done p{color:var(--gb-sub);font-size:13.5px;line-height:1.6}
  .gb-sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0;text-align:center}.gb-sum div{background:var(--gb-soft);border-radius:12px;padding:8px}
  .gb-sum dt{font-size:11px;color:var(--gb-sub)}.gb-sum dd{margin:2px 0 0;font-weight:700;font-size:13px}
  .gb-acts{display:grid;gap:8px}.gb-more{border:0;background:none;color:var(--gb-accent);font:inherit;font-weight:700;padding:10px;cursor:pointer;text-decoration:underline}
  .gb-shots{display:flex;flex-wrap:wrap;gap:8px}
  .gb-shot{position:relative;width:84px;height:84px;border-radius:12px;overflow:hidden;border:1.5px solid var(--gb-line);background:var(--gb-soft)}
  .gb-shot img{width:100%;height:100%;object-fit:cover;display:block}
  .gb-shot button{position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;border:0;background:rgba(10,20,45,.72);color:#fff;display:grid;place-items:center;cursor:pointer;padding:0}
  .gb-shot button svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}
  .gb-add{width:84px;height:84px;border-radius:12px;border:1.5px dashed color-mix(in srgb,var(--gb-accent) 40%,#fff);background:var(--gb-card);color:var(--gb-accent);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font:inherit;font-size:11px;font-weight:700;cursor:pointer}
  .gb-add svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
  .gb-add input{display:none}
  body.gb-on{overflow:hidden}
  @media (max-width:480px){.gb-kinds{grid-template-columns:repeat(2,1fr)}.gb-kind{flex-direction:row;justify-content:flex-start;gap:8px;padding:10px 12px;text-align:left}
    .gb-kind b{font-size:14px}.gb-kind small{display:block;text-align:left}.gb-kind span{display:flex;flex-direction:column;align-items:flex-start;min-width:0}}
  @media (min-width:900px){.gb-sheet{align-items:center}.gb-in{border-radius:22px;max-height:86vh;transform:translateY(16px) scale(.98)}.gb-hero{border-radius:22px 22px 0 0}
    .gb-fab{bottom:24px!important;right:24px}}
  @media (prefers-reduced-motion:reduce){.gb-sheet,.gb-in{transition:none}}
  /* ダークモード（2026-11-28 GO!シリーズ全体-004）：アプリがダークに対応しているときだけ（html.gb-auto）。
     右下のボタンは、ダークの背景に溶けないよう明るめの青＋明るい縁＋背景色のふち。シートは暗い地に明るい字 */
  .gb-dk .gb-fab{background:#3558B8;color:#fff;box-shadow:0 0 0 3px rgba(5,10,26,.92),0 8px 20px rgba(0,0,0,.55),inset 0 0 0 1.5px rgba(255,255,255,.55)}
  .gb-dk{--gb-ink:#EEF2FF;--gb-sub:#A6B0CD;--gb-line:#3A4A86;--gb-card:#141D3B;--gb-soft:#1B2650;--gb-err:#FF8A80}
  .gb-dk .gb-kind[aria-checked="true"]{border-color:var(--gb-gold);background:color-mix(in srgb,var(--gb-gold) 16%,var(--gb-card))}
  .gb-dk .gb-err{background:#3D1712}
  .gb-dk .gb-row .gb-ib,.gb-dk .gb-req,.gb-dk .gb-check,.gb-dk .gb-send{color:#0B1530}
  .gb-dk .gb-more{color:#9CC8F4}
  .gb-dk .gb-ta textarea:focus,.gb-dk .gb-sel:focus{border-color:var(--gb-gold)}
  .gb-dk .gb-ta textarea::placeholder{color:#7C88AA}`;
  const st = document.createElement("style"); st.id = "gbStyle"; st.textContent = css; document.head.appendChild(st);
  /* ダークの切りかえ：アプリの color-scheme（dark が入るか）と data-theme・端末の設定を見て、html に gb-dk をつけはずしする */
  const dk = () => {
    const h = document.documentElement, t = h.getAttribute("data-theme");
    const on = C.dark !== false && /dark/.test(getComputedStyle(h).colorScheme || "") && (t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches));
    h.classList.toggle("gb-dk", on);
  };
  dk(); try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", dk); new MutationObserver(dk).observe(document.documentElement, {attributes: true, attributeFilter: ["data-theme"]}); } catch (e) {}
  document.addEventListener("DOMContentLoaded", dk);

  /* ---------- 右下のボタン ---------- */
  if (C.fab) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "gb-fab"; b.id = "gbFab"; b.setAttribute("data-gobug", ""); b.setAttribute("aria-label", "不具合・要望を送る");
    b.style.bottom = C.bottom; if (C.right) b.style.right = C.right;
    b.innerHTML = svg(KINDS[0][3]) + "<span>不具合</span>";
    (document.body ? Promise.resolve() : new Promise(r => document.addEventListener("DOMContentLoaded", r))).then(() => document.body.appendChild(b));
  }

  const draft = () => { try { const d = JSON.parse(store(KEY) || "null"); return d && typeof d === "object" ? d : null; } catch (e) { return null; } };
  const save = d => store(KEY, d && (d.text || "").trim() ? JSON.stringify(d) : null);
  const kindName = k => (KINDS.find(x => x[0] === k) || KINDS[3])[1];

  function open(kind) {
    const d = draft();
    S.auto = where(); S.sent = null; S.err = ""; S.busy = false; if (!S.open) S.imgs = S.imgs || [];
    S.restored = !!(d && (d.text || "").trim());
    S.d = S.restored ? d : {text: "", kind: kind || "bug", screen: S.auto, cid: cid()};
    if (kind && !S.restored) S.d.kind = kind;
    let el = document.getElementById("gbSheet"); if (el) el.remove();
    el = document.createElement("div"); el.className = "gb-sheet"; el.id = "gbSheet";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "gbH");
    el.innerHTML = `<div class="gb-in" tabindex="-1"></div>`;
    el.addEventListener("click", ev => { if (ev.target === el) close(); });
    document.body.appendChild(el); document.body.classList.add("gb-on"); S.open = true;
    paint(); requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { const t = document.getElementById("gbText"); try { (t && !S.restored ? t : el.querySelector(".gb-in")).focus({preventScroll: true}); } catch (e) {} }, 300);
  }
  function close() {
    const el = document.getElementById("gbSheet"); if (!el) return;
    if (S.d && !S.sent) save(S.d);
    S.open = false; document.body.classList.remove("gb-on"); el.classList.remove("in"); setTimeout(() => el.remove(), 240);
  }
  function paint() {
    const el = document.getElementById("gbSheet"); if (!el) return;
    const box = el.querySelector(".gb-in"), d = S.d;
    const head = `<header class="gb-hero"><div><span class="gb-eye">${esc(C.app)} サポート</span><h3 id="gbH">${S.sent ? "届きました" : "不具合・要望を送る"}</h3>
      <p>${S.sent ? "運営チームに、そのまま届いています" : "書いた文章は、そのまま運営チームに届きます"}</p></div>
      <button type="button" class="gb-x" data-gbclose aria-label="閉じる">${svg(ICO.x)}</button></header>`;
    if (S.sent) {
      box.innerHTML = `${head}<div class="gb-done" role="status"><span class="gb-check">${svg(ICO.check)}</span><b>ありがとうございます！</b>
        <p>${demo() ? "見本なので、実際にはどこにも送っていません。" : "運営が読んで、直したらアプリに反映します。<br>必要なときは、こちらから連絡します。"}</p>
        <dl class="gb-sum"><div><dt>種類</dt><dd>${esc(kindName(S.sent.kind))}</dd></div><div><dt>画面</dt><dd>${esc(S.sent.screen || "—")}</dd></div><div><dt>${S.sent.n ? "スクショ" : "文字数"}</dt><dd>${S.sent.n ? S.sent.n + "枚" : S.sent.text.length + "字"}</dd></div></dl>
        <div class="gb-acts"><button type="button" class="gb-send" data-gbclose>閉じる</button><button type="button" class="gb-more" data-gbagain>もう1件送る</button></div></div>`;
      return;
    }
    const len = d.text.length, empty = !d.text.trim(), over = len > MAX;
    const opts = [...new Set([d.screen, S.auto, ...(C.screens || []), "アプリ全体・その他"].filter(Boolean))];
    box.innerHTML = `${head}<div class="gb-body">
      <span class="gb-k">種類</span>
      <div class="gb-kinds" role="radiogroup" aria-label="種類">${KINDS.map(([k, l, s, ic]) => `<button type="button" role="radio" class="gb-kind" data-gbkind="${k}" aria-checked="${d.kind === k}">${svg(ic)}<span><b>${l}</b><small>${s}</small></span></button>`).join("")}</div>
      <label class="gb-k" for="gbScreen">どの画面のこと？</label>
      <select class="gb-sel" id="gbScreen">${opts.map(o => `<option${o === d.screen ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>
      ${S.auto ? `<p class="gb-hint">開いていた画面「${esc(S.auto)}」も、いっしょに送ります</p>` : ""}
      <label class="gb-k" for="gbText">くわしく<span class="gb-req">必須</span></label>
      <div class="gb-ta${over ? " over" : ""}"><textarea id="gbText" rows="6" maxlength="${MAX + 200}" placeholder="${esc(PH[d.kind] || PH.other)}">${esc(d.text)}</textarea><span class="gb-count" id="gbCount" aria-live="polite">${len} / ${MAX}</span></div>
      ${S.restored ? `<p class="gb-hint">前に書いた下書きを出しています</p>` : ""}
      <span class="gb-k">スクショ<span class="gb-opt">あれば（${IMG_MAX}枚まで）</span></span>
      <div class="gb-shots">${S.imgs.map((m, i) => `<div class="gb-shot"><img src="${m.url}" alt="スクショ${i + 1}"><button type="button" data-gbdel="${i}" aria-label="スクショ${i + 1}を外す">${svg(ICO.x)}</button></div>`).join("")}
        ${S.imgs.length < IMG_MAX ? `<label class="gb-add">${S.imgBusy ? `<span class="gb-spin" aria-hidden="true"></span>` : svg(ICO.cam)}${S.imgBusy ? "縮めています" : "写真を選ぶ"}<input type="file" id="gbFile" accept="image/*" multiple></label>` : ""}</div>
      <p class="gb-hint">お客様の名前や連絡先が写っていたら、塗りつぶしてから選んでください</p>
      <p class="gb-cheer">ひとことでも大丈夫です。「なんか変かも」も大歓迎。みんなの声で、アプリが毎週よくなります。</p>
      ${S.err ? `<div class="gb-err" role="alert"><p><b>送れませんでした</b><br>${esc(S.err)}<br>書いた文章はこの端末に残しています。</p></div>` : ""}
      <p class="gb-meta">いっしょに送るもの：アプリの名前・画面・端末とブラウザ・時刻・アプリの版${C.who ? "・表示名" : ""}${S.imgs.length ? "・スクショ" : ""}（パスワードや本名、お客様の情報は書かないでください）</p>
      <button type="button" class="gb-send" id="gbSend" ${empty || over || S.busy || S.imgBusy ? "disabled" : ""}>${S.busy ? `<span class="gb-spin" aria-hidden="true"></span>送っています…` : `${svg(ICO.send)}運営に送る`}</button>
    </div>`;
  }
  function input(t) {
    S.d.text = t.value; save(S.d);
    const len = t.value.length, over = len > MAX, c = document.getElementById("gbCount"), b = document.getElementById("gbSend");
    if (c) { c.textContent = `${len} / ${MAX}`; c.parentElement.classList.toggle("over", over); }
    if (b && !S.busy) b.disabled = !t.value.trim() || over || S.imgBusy;
  }
  const errMsg = e => {
    const m = String(e && e.message || e || "");
    if (m === "offline" || /Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "電波が弱いか、インターネットにつながっていません。電波のよいところで、もう一度押してください。";
    if (/^busy$/.test(m)) return "いま続けて届いています。1分ほど待ってから、もう一度押してください。";
    return "運営の受け口がいま応えていません。少し待ってから、もう一度押してください。";
  };
  async function submit() {
    const d = S.d; if (!d || S.busy) return;
    const text = d.text.trim(); if (!text || d.text.length > MAX) return;
    S.busy = true; S.err = ""; save(d); paint();
    try {
      if (demo()) await new Promise(r => setTimeout(r, 500));
      else {
        if (navigator.onLine === false) throw new Error("offline");
        let who = ""; try { who = typeof C.who === "function" ? String(C.who() || "").slice(0, 40) : ""; } catch (e) {}
        const ver = (document.querySelector('meta[name="app-version"]') || {}).content || "";
        const r = await fetch(C.endpoint, {method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"},
          body: JSON.stringify({app: C.app, kind: d.kind, screen: d.screen, auto: S.auto, text, cid: d.cid, ver, who, url: location.origin + location.pathname,
            ua: navigator.userAgent, scr: {w: Math.round(innerWidth), h: Math.round(innerHeight)},
            imgs: S.imgs.map((m, i) => ({name: "shot" + (i + 1) + ".jpg", type: "image/jpeg", b64: m.url.split(",")[1]}))})});
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || "ng");
      }
      S.sent = {kind: d.kind, screen: d.screen, text, n: S.imgs.length}; store(KEY, null); S.d = null; S.imgs = [];
    } catch (e) { S.err = errMsg(e); }
    S.busy = false; S.restored = false; paint();
  }
  document.addEventListener("click", ev => {
    const t = ev.target.closest && ev.target.closest("[data-gobug],[data-gbclose],[data-gbkind],[data-gbagain],[data-gbdel],#gbSend"); if (!t) return;
    if (t.hasAttribute("data-gobug")) { ev.preventDefault(); if (typeof C.beforeOpen === "function") try { C.beforeOpen(); } catch (e) {} open(t.dataset.gobug || ""); return; }
    if (t.hasAttribute("data-gbclose")) { close(); return; }
    if (t.dataset.gbkind) { S.d.kind = t.dataset.gbkind; save(S.d); paint(); return; }
    if (t.hasAttribute("data-gbdel")) { S.imgs.splice(Number(t.dataset.gbdel), 1); paint(); return; }
    if (t.hasAttribute("data-gbagain")) { S.sent = null; S.imgs = []; S.d = {text: "", kind: "bug", screen: S.auto, cid: cid()}; paint(); return; }
    if (t.id === "gbSend") submit();
  });
  document.addEventListener("input", ev => { if (ev.target && ev.target.id === "gbText" && S.d) input(ev.target); });
  document.addEventListener("change", ev => {
    if (ev.target && ev.target.id === "gbScreen" && S.d) { S.d.screen = ev.target.value; save(S.d); }
    if (ev.target && ev.target.id === "gbFile" && S.d) { S.err = ""; addImgs(ev.target.files); }
  });
  // PC：画面に貼りつけ（⌘V）でもスクショを足せる
  document.addEventListener("paste", ev => {
    if (!S.open || !S.d || S.sent) return;
    const fs = [...((ev.clipboardData || {}).items || [])].filter(x => x.kind === "file" && /^image\//.test(x.type)).map(x => x.getAsFile()).filter(Boolean);
    if (fs.length) { ev.preventDefault(); addImgs(fs); }
  });
  document.addEventListener("keydown", ev => {
    if (!S.open) return;
    if (ev.key === "Escape") { close(); return; }
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && ev.target && ev.target.id === "gbText" && !ev.isComposing) { ev.preventDefault(); const b = document.getElementById("gbSend"); if (b && !b.disabled) submit(); }
  });
  const row = () => `<button type="button" class="gb-row" data-gobug=""><span class="gb-ib">${svg(ICO.send)}</span><span><b>不具合・要望を送る</b><small>動かない・こうしてほしい、を運営に文章で</small></span><em aria-hidden="true">›</em></button>`;
  window.GoBug = {open, close, row, config: C};
})();
