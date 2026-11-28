// LINE GO!（Sales GO! の6つ目のタブ・Sales GO!-007・2026-11-28）
// 芯：「予定は Sales GO!、ことばは LINE GO!。お客様のカルテは1つ」。予定を変えるのは Sales GO! だけ。送る文は送る前の見張りを通ったものだけ。
// 受け口の line_inbox（読むだけ）・line_decide（ボタン4つ）・line_seed（スキルの芽）を使う。受け口の SGO_FEATURES の line_go が off ならタブごと出さない。
// 名前・本文の全文はここに来ない（要約30字・案の名前は「◯◯」）。全文は UTAGE のトークで見る。公開リポジトリなので、データも秘密の値もここに書かない。
// index.html のあとで呼ばれる関数だけを置く（D・api・esc などは index.html のもの）。
(function () {
  'use strict';
  const LG = { D: null, sub: 'talk', sel: '', fil: 'all', showing: false, err: '', loading: false, late: {} };
  const FLAG = { ai: 'AIの案', guard: '送る前に確認', human: '人が見る', hand: '任された', auto: '自動で返した', none: '返事不要', done: '対応済み' };
  const WAIT = { ai: 1, guard: 1, human: 1, hand: 1 };
  const FILTERS = [['all', 'すべて'], ['wait', '返事まち'], ['ai', 'AIの案'], ['guard', '送る前に確認'], ['human', '人が見る'], ['done', '済み']];
  const STEPS = ['友だち', 'セミナー', '面談予約', 'ヒアリング', '面談', '結果'];
  const LV = { 1: '案だけ', 2: 'ボタンで送る', 3: '自動で返す' };
  const SUBS = [['talk', 'トーク'], ['bridge', '依頼'], ['skills', 'スキル帳'], ['rules', 'ルール']];
  const LATE = '返信がおそくなってしまい、すみません！\n';

  const on = () => !!(D && D.features && (D.features.line_go === 'read' || D.features.line_go === 'send'));
  const canSend = () => !!(LG.D && LG.D.mode === 'send');
  const th = fid => ((LG.D && LG.D.threads) || []).find(t => t.fid === fid);
  const waiting = () => ((LG.D && LG.D.threads) || []).filter(t => WAIT[t.flag] && !t.sending);
  const fidOf = r => { const m = String((r && r.talk_url) || '').match(/#([A-Za-z0-9_-]{6,})$/); return m ? m[1] : ''; };
  const threadOfMeeting = r => ((LG.D && LG.D.threads) || []).find(t => t.applicant_id === r.applicant_id) || null;
  const stCls = s => /キャンセル|見送り|失注/.test(s) ? 'lg-st-x' : /セミナー/.test(s) ? 'lg-st-s' : s ? 'lg-st-m' : '';
  const when = s => { const d = parse(s); return d ? (String(s).slice(0, 10) === (D && D.today) ? hm(s) : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm(s)) : ''; };

  function step(t) {
    const m = t.applicant_id ? meetingById(t.applicant_id) : null;
    if (!m) return /セミナー/.test(t.stage || '') ? 1 : 0;
    if (m.report === 'done') return 5;
    if (parse(m.start) && parse(m.start) <= nowD()) return 4;
    if (m.hearing || m.hearing_kind === 'submitted') return 3;
    return 2;
  }

  // ---- 読み込み（me のあとに1回。失敗しても Sales GO! の画面は止めない） ----
  async function load() {
    if (!on()) { LG.D = null; syncTab(); return; }
    if (LG.loading) return; LG.loading = true;
    const j = await api('line_inbox', isAdmin() && FM ? { who: FM } : {});
    LG.loading = false;
    if (!j.ok) { LG.err = errMsg(j); LG.D = LG.D || null; } else { LG.err = ''; LG.D = j; }
    syncTab(); if (TAB === 'line' || TAB === 'today' || TAB === 'meet') render();
  }
  function syncTab() {
    const b = document.querySelector('.tab[data-tab="line"]'); if (!b) return;
    b.hidden = !on();
    const n = LG.D ? waiting().length : 0, bd = b.querySelector('.badge');
    if (bd) { bd.hidden = !n; bd.textContent = n; }
  }

  // ---- 今日タブ：返事まちの帯・きょうの1件だけ・LINEからの依頼 ----
  function todayBand() {
    if (!on() || !LG.D) return '';
    const w = waiting(), br = (LG.D.bridges || []), tk = LG.D.taught;
    const one = w.find(t => t.flag === 'ai');
    let h = '<button type="button" class="lg-band" data-lg-go="wait"><span class="lg-band-h"><span>💬 LINEの返事まち</span><b>' + w.length + '<small>件</small></b></span>' +
      '<span class="lg-band-s">' + (w.length ? '見る →' : 'ゼロです！🎉 いい感じ') + '</span></button>';
    if (one && canSend()) h += '<button type="button" class="lg-one" data-lg-open="' + esc(one.fid) + '"><b>きょうの1件だけ</b><span>AIの案を1通見て押すだけ。30秒で、スキルが1つ育ちます</span>' +
      (tk ? '<small>先週のあなた：教えた ' + (tk.last_week || 0) + '回 → 今週：' + (tk.this_week || 0) + '回</small>' : '') + '</button>';
    if (br.length) h += '<button type="button" class="lg-band lg-band-b" data-lg-sub="bridge"><span class="lg-band-h"><span>📨 LINEからの依頼</span><b>' + br.length + '<small>件</small></b></span><span class="lg-band-s">予約の依頼・キャンセルの確認・フォロー</span></button>';
    return h;
  }

  // ---- 面談カード：面談の準備の「LINE」・トークを開く ----
  function cardLink(r) {
    if (!on()) return r.talk_url ? '<div class="act"><a class="go second" style="display:block;text-align:center;text-decoration:none" href="' + esc(r.talk_url) + '" target="_blank" rel="noopener noreferrer">💬 LINEトークを開く（1対1）</a></div>' : '';
    const fid = fidOf(r);
    if (!fid) return '';
    return '<div class="act"><button type="button" class="go second" data-lg-open="' + esc(fid) + '">💬 LINE GO! でこの方のトークを開く</button>' +
      '<div class="note"><a href="' + esc(r.talk_url) + '" target="_blank" rel="noopener noreferrer">UTAGE のトークで全文を見る</a></div></div>';
  }
  function hasPrep() { return on(); }
  function prepLabel(r) { const s = LG.D && LG.D.summaries && LG.D.summaries[r.applicant_id]; return s ? 'あり' : 'なし'; }
  function prepPane(r) {
    const s = LG.D && LG.D.summaries && LG.D.summaries[r.applicant_id];
    const t = threadOfMeeting(r), fid = fidOf(r) || (t && t.fid);
    let h = s ? '<div class="lg-sum"><div><small>いちばんの心配</small><b>' + esc(s.worry) + '</b></div><div><small>温度</small><b>' + esc(s.temp) + '</b></div><div><small>約束したこと</small><b>' + esc(s.promise) + '</b></div></div>' +
      '<div class="note">LINEでの最近のやり取りから Claude がまとめた3行です（' + esc(s.msg_at ? mdt(s.msg_at) + 'までの分' : '') + '）。本文は残していません。決めつけず、面談で確かめてください。</div>'
      : '<div class="note" style="margin:0">まだありません。面談の48時間前から、LINEでやり取りがあればここに3行で出ます。</div>';
    if (t) h += '<div class="lg-mini">' + esc(FLAG[t.flag] || '') + '・' + esc(t.summary || '') + '</div>';
    if (fid) h += '<button type="button" class="go second" style="margin-top:8px" data-lg-open="' + esc(fid) + '">LINE GO! でこの方のトークを開く</button>';
    return h;
  }

  // ---- LINE タブ ----
  function view() {
    document.body.classList.toggle('lg-wide', TAB === 'line');
    const v = document.getElementById('v-line'); if (!v) return;
    if (!on()) { v.innerHTML = '<div class="empty">LINE GO! は準備中です。</div>'; return; }
    if (!LG.D) { v.innerHTML = '<div class="empty">' + esc(LG.err || '読み込み中…') + '</div>'; return; }
    const nb = (LG.D.bridges || []).length;
    let h = '<div class="lg-subs">' + SUBS.map(([k, n]) => '<button type="button" data-lg-sub="' + k + '" class="' + (LG.sub === k ? 'on' : '') + '">' + n +
      (k === 'talk' && waiting().length ? '<span class="n">' + waiting().length + '</span>' : '') + (k === 'bridge' && nb ? '<span class="n">' + nb + '</span>' : '') + '</button>').join('') + '</div>';
    if (LG.D.mode !== 'send') h += '<div class="box info lg-readonly">いまは<b>見るだけ</b>の段です。返信は UTAGE のトークから。ボタンで送れるようになったら、ここに出ます。</div>';
    h += LG.sub === 'bridge' ? viewBridge() : LG.sub === 'skills' ? viewSkills() : LG.sub === 'rules' ? viewRules() : viewTalk();
    h += '<div class="note lg-upd">LINE GO! の一覧の更新 ' + esc(LG.D.updated_at ? mdt(LG.D.updated_at) : '未取得') + '（Mac mini が1分おきに書き直します）</div>';
    v.innerHTML = h;
  }

  function viewTalk() {
    const all = LG.D.threads || [];
    const pick = t => LG.fil === 'all' || (LG.fil === 'wait' ? WAIT[t.flag] : LG.fil === 'done' ? (t.flag === 'done' || t.flag === 'auto' || t.flag === 'none') : t.flag === LG.fil);
    const list = all.filter(pick);
    if (!LG.sel && list[0] && window.innerWidth >= 1000) LG.sel = list[0].fid;
    const t = th(LG.sel);
    const fil = FILTERS.map(([k, n]) => '<button type="button" data-lg-fil="' + k + '" class="' + (LG.fil === k ? 'on' : '') + '">' + n + '<span class="n">' + all.filter(x => k === 'all' || (k === 'wait' ? WAIT[x.flag] : k === 'done' ? /done|auto|none/.test(x.flag) : x.flag === k)).length + '</span></button>').join('');
    const items = list.length ? list.map(x => '<button type="button" class="lg-th' + (x.fid === LG.sel ? ' sel' : '') + '" data-lg-open="' + esc(x.fid) + '">' +
      '<span class="r1"><span class="nm">' + esc(name(x)) + '</span><span class="tm">' + esc(when(x.last_at)) + '</span></span>' +
      '<span class="last">' + esc(x.summary || '') + '</span><span class="chips2">' + (x.stage ? '<span class="lg-chip ' + stCls(x.stage) + '">' + esc(x.stage) + '</span>' : '') +
      '<span class="lg-chip f-' + esc(x.flag) + '">' + (x.sending ? '送る予約に入れました' : esc(FLAG[x.flag] || x.flag)) + '</span>' + (isAdmin() && x.member ? '<span class="lg-chip">担当 ' + esc(x.member) + '</span>' : '') + '</span></button>').join('')
      : '<div class="empty">ここに入る連絡はありません' + (LG.fil === 'wait' ? '。返事まちゼロ！🎉' : '') + '</div>';
    return '<div class="lg-talk' + (LG.showing ? ' showing' : '') + '"><section class="lg-list" aria-label="受信一覧"><div class="chips lg-fil">' + fil + '</div>' + items + '</section>' +
      '<section class="lg-conv" aria-label="トーク">' + (t ? viewConv(t) : '<div class="empty">一覧から1人えらんでください</div>') + '</section>' +
      '<aside class="lg-side" aria-label="この方のいま">' + (t ? viewFacts(t) : '') + '</aside></div>';
  }
  function name(t) { const m = t.applicant_id ? meetingById(t.applicant_id) : null; return m ? (m.name ? m.name + ' さん' : custName(m)) : 'LINEの友だち（予約なし）'; }

  function viewConv(t) {
    const s = step(t);
    const steps = STEPS.map((n, i) => '<li class="' + (i < s ? 'done' : i === s ? 'cur' : '') + '"><span class="dot">' + (i < s ? '✓' : i + 1) + '</span>' + n + '</li>').join('');
    let h = '<div class="lg-conv-h"><div class="r1"><button type="button" class="lg-back" data-lg-back="1">← 一覧</button><h2>' + esc(name(t)) + '</h2>' +
      (t.stage ? '<span class="lg-chip ' + stCls(t.stage) + '">' + esc(t.stage) + '</span>' : '') + '</div><ol class="lg-steps" aria-label="この方の歩み">' + steps + '</ol></div>';
    h += '<div class="lg-msg"><small>届いた連絡（要約）・' + esc(when(t.last_at)) + (t.count ? '・' + esc(t.count) + '通' : '') + '</small><p>' + esc(t.summary || '（要約なし）') + '</p>' +
      (t.intent ? '<span class="lg-chip">' + esc(t.intent) + '</span>' : '') + (t.action ? '<span class="lg-chip">' + esc(t.action) + '</span>' : '') +
      (t.stop_reason ? '<div class="note">止めた理由：' + esc(t.stop_reason) + '</div>' : '') +
      '<a class="lg-utage" href="' + esc(t.talk_url) + '" target="_blank" rel="noopener noreferrer">UTAGE のトークで全文を見る</a></div>';
    h += viewDraft(t);
    if (canSend() && !t.sending && t.flag !== 'done') h += '<label class="lg-direct"><span class="hint">直接返信（自分のことばで。送った文もスキルの材料に）</span><textarea id="lgDirect" rows="2" maxlength="1000" placeholder="お名前は ◯◯ と書けば、送るときに入ります"></textarea><button type="button" class="go" data-lg-direct="' + esc(t.fid) + '">送る</button></label>';
    return h;
  }

  function viewDraft(t) {
    if (t.sending) return '<div class="result wait">送る予約に入れました。送る前の見張りを通ったら送ります（1分ほど）</div>';
    if (t.flag === 'done' || t.flag === 'auto' || t.flag === 'none') return '<div class="box ok">' + esc(t.done_note || FLAG[t.flag]) + '</div>';
    if (!t.draft_id) return t.flag === 'hand' ? '<div class="box y">' + esc(t.done_note || '担当に任されました') + '。UTAGE のトークで返すか、下の直接返信から</div>' : '<div class="box y">AIの案はありません。人が見る連絡です</div>';
    const lv = +t.draft_lv || 1;
    const head = '<div class="r1"><span class="lg-chip f-ai">AIの案</span><b>スキル「' + esc(t.draft_skill) + '」</b><span class="lg-lv l' + lv + '">Lv' + lv + ' ' + LV[lv] + '</span></div>';
    const ta = '<textarea id="lgDraft" rows="5" aria-label="返信の案"' + (canSend() ? '' : ' readonly') + '>' + esc((LG.late[t.fid] ? LATE : '') + t.draft_text) + '</textarea>';
    if (!canSend()) return '<section class="lg-draft">' + head + ta + '<div class="hint">見るだけの段なので、ボタンはまだ出ません</div></section>';
    if (t.flag === 'guard' && !LG.late[t.fid]) {
      return '<section class="lg-draft guard"><div class="lg-guardbox"><h3>この返信、いま送ると不自然かも</h3><div>' + esc(t.guard_why || '時間がたっています') + '</div></div>' + head + ta +
        '<div class="lg-btns"><button type="button" class="go" data-lg-act="skip" data-fid="' + esc(t.fid) + '">送らない（おすすめ）</button><button type="button" class="go second" data-lg-act="late" data-fid="' + esc(t.fid) + '">遅れたおわびに直す</button></div>' +
        '<div class="hint">送る直前にも Mac mini がもう一度見ます。間に誰かが返していたら、直しても送りません</div></section>';
    }
    return '<section class="lg-draft">' + head + ta +
      '<div class="lg-btns"><button type="button" class="go" data-lg-act="send" data-fid="' + esc(t.fid) + '"' + (LG.late[t.fid] ? ' hidden' : '') + '>このまま送る</button>' +
      '<button type="button" class="go' + (LG.late[t.fid] ? '' : ' second') + '" data-lg-act="edit" data-fid="' + esc(t.fid) + '">直して送る（AIが覚える）</button>' +
      '<button type="button" class="go second" data-lg-act="skip" data-fid="' + esc(t.fid) + '">返さない</button><button type="button" class="go second" data-lg-act="hand" data-fid="' + esc(t.fid) + '">担当に任せる</button></div>' +
      (lv < 3 && t.draft_next ? '<div class="hint">あと <b>' + esc(t.draft_next) + '回</b> 直されずに送れたら、このスキルは Lv' + (lv + 1) + '（' + LV[lv + 1] + '）に' + (lv === 2 ? '（SHUHEYのOKつき）' : '') + '</div>' : '') + '</section>';
  }

  function viewFacts(t) {
    const m = t.applicant_id ? meetingById(t.applicant_id) : null;
    const row = (i, k, v, n) => '<div class="lg-fact"><i>' + i + '</i><div><small>' + k + '</small><b>' + esc(v || '—') + '</b>' + (n ? '<span>' + esc(n) + '</span>' : '') + '</div></div>';
    let h = '<div class="lg-facts"><h3>この方の いま</h3>';
    if (m) {
      h += row('面', '面談', mdt(m.start), m.stage) + row('ヒ', 'ヒアリング', m.hearing ? '提出済み' : m.hearing_kind === 'submitted' ? '提出済み（取り込み中）' : m.project === '旅キャリ' ? 'なし' : 'まだ') +
        row('担', '担当', m.member) + row('報', '前回の報告', m.report === 'done' ? (m.report_summary || '報告済み') : m.report === 'needed' ? '報告がまだ' : '—') +
        row('止', '自動返信', m.muted === '1' ? '止めています' : '動いています');
      const s = LG.D.summaries && LG.D.summaries[m.applicant_id];
      if (s) h += '<div class="lg-sum sm"><div><small>心配</small><b>' + esc(s.worry) + '</b></div><div><small>温度</small><b>' + esc(s.temp) + '</b></div><div><small>約束</small><b>' + esc(s.promise) + '</b></div></div>';
      h += '<button type="button" class="go" data-go-meet="' + esc(m.applicant_id) + '">Sales GO! でこの面談を開く</button><div class="note">日程の変更・キャンセル・担当の変更は、面談カードで（予定を変えるのは Sales GO! だけ）</div>';
    } else {
      h += row('面', '面談', 'まだ予約がありません') + '<div class="note">日時の希望が届いていたら「依頼」に出ます。予約は Sales GO! の「UTAGEに無い予約を登録」から</div>';
    }
    return h + '</div>';
  }

  function viewBridge() {
    const B = LG.D.bridges || [];
    const KIND = { booking: ['📅', '予約の依頼'], cancel: ['🙏', 'キャンセルの確認'], followup: ['📝', 'フォローの案'] };
    const cards = B.map(b => {
      const k = KIND[b.kind] || ['・', b.kind], m = b.applicant_id ? meetingById(b.applicant_id) : null;
      const act = b.kind === 'booking' ? '<button type="button" class="go" data-lg-ext="1">Sales GO! で予約を登録する</button>'
        : b.kind === 'cancel' && m ? '<button type="button" class="go undo" data-lg-cancel="' + esc(b.applicant_id) + '">この面談をキャンセルにする</button><div class="note">お礼の返事は LINE GO! が返しています。面談を消すかは担当が決めます</div>'
          : b.kind === 'followup' && th(b.fid) ? '<button type="button" class="go" data-lg-open="' + esc(b.fid) + '">案を見て送る</button>' : '<div class="note">' + esc(b.due_at ? mdt(b.due_at) + ' に案が入ります' : '') + '</div>';
      return '<div class="lg-br"><div class="r1"><span class="ic">' + k[0] + '</span><b>' + esc(k[1]) + '</b>' + (m ? '<span class="lg-chip">' + esc(m.name ? m.name + ' さん' : custName(m)) + '</span>' : '') +
        (isAdmin() && b.member ? '<span class="lg-chip">担当 ' + esc(b.member) + '</span>' : '') + '</div><div>' + esc(b.title) + '</div>' + (b.detail ? '<div class="lg-mini">' + esc(b.detail) + '</div>' : '') + act + '</div>';
    }).join('');
    return '<div class="sec-h"><h2>LINE からの依頼</h2><span class="hint">どれも「案・依頼」まで。確定はあなたが押します</span></div>' + (cards || '<div class="empty">いまは依頼がありません</div>');
  }

  function viewSkills() {
    const S = LG.D.skills || [], seeds = LG.D.seeds || [], tk = LG.D.taught;
    let h = '<div class="sec-h"><h2>スキル帳</h2><span class="hint">返した1通1通が、チームのスキルになります</span></div>';
    if (tk) h += '<div class="lg-taught"><div><small>今週あなたが教えた</small><b>' + (tk.this_week || 0) + '</b><span>回</span></div><div><small>先週のあなた</small><b>' + (tk.last_week || 0) + '</b><span>回</span></div>' +
      '<div><small>今週さばいた連絡</small><b>' + (tk.handled || 0) + '</b><span>通</span></div></div><div class="note">順位は出しません。比べるのは先週の自分。1回の「直して送る」が、チーム全員の返信を楽にします</div>';
    h += S.length ? '<div class="lg-skills">' + S.map(k => '<article class="lg-sk l' + k.lv + '"><div class="r1"><span class="lg-lv l' + k.lv + '">Lv' + k.lv + ' ' + LV[k.lv] + '</span>' + (k.need_ok ? '<span class="lg-chip f-guard">SHUHEYのOK待ち</span>' : '') + '</div>' +
      '<h3>' + esc(k.name) + '</h3><div class="lg-bar"><i style="width:' + Math.max(4, Math.min(100, k.pct || 0)) + '%"></i></div>' +
      '<div class="foot"><span>' + (k.lv === 3 ? 'いちばん上の段' : '次の段まで あと' + (k.next || 0) + '回') + '</span><span>今週 ' + (k.used || 0) + '回</span><span>直された ' + (k.fixed || 0) + '</span><span>教えた人 ' + (k.teachers || 0) + '人</span></div></article>').join('') + '</div>'
      : '<div class="empty">まだスキルの記録がありません。ボタンを押すたびにたまっていきます</div>';
    if (LG.D.admin) h += '<div class="sec-h"><h2>新しいスキルの芽</h2><span class="hint">成約した会話から週に1回（月曜）。スキルにすると Lv1（案だけ）から</span></div>' +
      (seeds.length ? seeds.map(s => '<div class="lg-seed"><span class="n">' + (s.count || 1) + '</span><div class="t"><b>' + esc(s.name) + '</b><span>' + esc(s.when || '') + '</span>' + (s.sample ? '<em>' + esc(s.sample) + '</em>' : '') +
        (s.members && s.members.length ? '<small>教えた人：' + esc(s.members.join('・')) + '</small>' : '') + '</div><div class="act2"><button type="button" class="go" data-lg-seed="' + esc(s.name) + '" data-v="make">スキルにする</button><button type="button" class="go second" data-lg-seed="' + esc(s.name) + '" data-v="skip">見送り</button></div></div>').join('')
        : '<div class="empty">今週の芽はまだありません</div>');
    h += '<div class="lg-ladder"><h3>スキルの3つの段</h3><div><span class="lg-lv l1">Lv1</span><span><b>案だけ</b>　AIが下書き。送るのは人</span></div><div><span class="lg-lv l2">Lv2</span><span><b>ボタンで送る</b>　10回のうち9回、直さずに送れたら上がる</span></div>' +
      '<div><span class="lg-lv l3">Lv3</span><span><b>自動で返す</b>　20回つづけて直しなし＋SHUHEYの「OK」で上がる。まちがいが出たら1段もどる</span></div></div>';
    return h;
  }

  function viewRules() {
    return '<div class="sec-h"><h2>送る前の見張り</h2><span class="hint">どこから出る文も、ここを1回通ります</span></div><div class="lg-rules">' +
      '<div>⏱ 相手の最後の連絡から <b>3時間</b> を超えた（キャンセル・日程は <b>1時間</b>）</div><div>🌙 夜をまたいだ（相手の連絡が前の日で、送るのが翌朝）・夜（22時〜7時台）は送らない</div>' +
      '<div>↔️ その間に、人の返信・別の自動の文・相手の次の連絡があった（直しても送りません）</div><div>🔁 案を作ったときと今とで、相手の状態が変わった（キャンセル済・面談済・日程変更）</div>' +
      '<div>📤 Sales GO! の「LINEで送る」も同じ見張り：見送り・キャンセルの方、10分以内に別の文が出た方には送りません</div></div>' +
      '<div class="note">時間・夜またぎだけのときは「遅れたおわびに直す」で、人が直してから送れます。止めた件は理由つきで記録します</div>' +
      '<div class="sec-h"><h2>線引き</h2></div><div class="lg-rules"><div>📅 予定を変えるのは Sales GO! だけ（日程変更・キャンセル・担当）</div><div>💬 お客様に文を送るのは LINE GO! の見張りを通ったものだけ</div><div>🧭 旅キャリ（YUSUKE先生側）はまだ入れていません</div></div>';
  }

  // ---- 押した ----
  async function decide(fid, choice, text, extra) {
    const t = th(fid); if (!t) return;
    const j = await api('line_decide', Object.assign({ client_id: cid('lg'), fid, choice, draft_id: t.draft_id || '', text: text || '' }, extra || {}));
    if (!j.ok) { toast(errMsg(j)); return; }
    t.sending = '1'; delete LG.late[fid];
    const next = waiting().find(x => x.fid !== fid);
    toast(choice === 'skip' ? '返さないにしました' : choice === 'hand' ? '担当に任せました' : '送る予約に入れました。次の1通へ');
    if (next) { LG.sel = next.fid; } else { LG.showing = false; }
    view(); syncTab();
    poll(j.id, q => {
      if (q.status === 'timeout') { toast(TIMEOUT_TEXT); return; }
      t.sending = ''; t.flag = q.status === 'done' ? (choice === 'hand' ? 'hand' : 'done') : t.flag;
      t.done_note = (q.result_title || '') + (q.result_lines ? '：' + q.result_lines : '');
      if (q.status !== 'done') toast((q.result_title || '送れませんでした') + (q.result_lines ? '（' + q.result_lines + '）' : ''));
      if (TAB === 'line') view(); syncTab();
    });
  }

  function click(e) {
    const t = e.target;
    const op = t.closest('[data-lg-open]');
    if (op) { LG.sel = op.dataset.lgOpen; LG.sub = 'talk'; LG.showing = true; if (LG.fil !== 'all' && !(th(LG.sel) && (LG.fil === 'wait' ? WAIT[th(LG.sel).flag] : th(LG.sel).flag === LG.fil))) LG.fil = 'all'; if (TAB !== 'line') showTab('line'); else view(); window.scrollTo(0, 0); return true; }
    const go = t.closest('[data-lg-go]'); if (go) { LG.sub = 'talk'; LG.fil = 'wait'; LG.showing = false; showTab('line'); return true; }
    const sb = t.closest('[data-lg-sub]'); if (sb) { LG.sub = sb.dataset.lgSub; if (TAB !== 'line') showTab('line'); else view(); return true; }
    const fl = t.closest('[data-lg-fil]'); if (fl) { LG.fil = fl.dataset.lgFil; view(); return true; }
    if (t.closest('[data-lg-back]')) { LG.showing = false; view(); return true; }
    if (t.closest('[data-lg-ext]')) { openExt(); return true; }
    const cx = t.closest('[data-lg-cancel]'); if (cx) { askCancel(cx.dataset.lgCancel); return true; }
    const sd = t.closest('[data-lg-seed]');
    if (sd) {
      api('line_seed', { client_id: cid('sd'), seed: sd.dataset.lgSeed, do: sd.dataset.v }).then(j => {
        if (!j.ok) { toast(errMsg(j)); return; }
        LG.D.seeds = (LG.D.seeds || []).filter(s => s.name !== sd.dataset.lgSeed);
        toast(sd.dataset.v === 'make' ? 'スキルの案にしました。過去の受信で試してから、Lv1 で入ります' : '見送りにしました'); view();
      });
      return true;
    }
    const dr = t.closest('[data-lg-direct]');
    if (dr) { const v = (document.getElementById('lgDirect') || {}).value || ''; if (!v.trim()) { toast('送る文を書いてください'); return true; } decide(dr.dataset.lgDirect, 'direct', v); return true; }
    const ac = t.closest('[data-lg-act]');
    if (ac) {
      const fid = ac.dataset.fid, x = th(fid), ta = document.getElementById('lgDraft'), a = ac.dataset.lgAct;
      if (!x) return true;
      if (a === 'late') { LG.late[fid] = 1; view(); const n = document.getElementById('lgDraft'); if (n) { n.focus(); n.setSelectionRange(0, LATE.length); } toast('おわびを足しました。確かめて「直して送る」へ'); return true; }
      if (a === 'edit') {
        const v = ta ? ta.value : '';
        if (!LG.late[fid] && v === x.draft_text) { if (ta) ta.focus(); toast('案を直してから、もう一度押してください'); return true; }
        decide(fid, 'edit', v, LG.late[fid] ? { ack_guard: true } : null); return true;
      }
      decide(fid, a, ''); return true;
    }
    return false;
  }

  // ---- 見本（?demo=1）：架空のお客様。どこにも送らない ----
  function demoData(dd, now) {
    const at = (n, h, mi = 0) => stamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, h, mi));
    const me = (dd.user && dd.user.member) || 'MIKA';
    const T = (o) => Object.assign({ fid: '', applicant_id: '', member: me, project: '広告', last_at: '', count: '1', summary: '', intent: '', target: '', flag: 'none', action: '', stop_reason: '', guard_why: '',
      stage: '', start: '', hearing: '', talk_url: 'https://example.com/line/talk#', draft_id: '', draft_skill: '', draft_lv: '', draft_text: '', draft_next: '', updated_at: at(0, 12, 59) }, o, { talk_url: 'https://example.com/line/talk#' + o.fid });
    const threads = [
      T({ fid: 'Ufdemo03', applicant_id: 'demo03', last_at: at(0, 12, 41), summary: '今夜のZoom、スマホからでも入れますか？', intent: '入室・接続', flag: 'ai', stage: 'ロードマップ面談', draft_id: 'd1', draft_skill: '入室・接続', draft_lv: '2', draft_next: '3',
        draft_text: '◯◯様\nご連絡ありがとうございます！スマホからでも大丈夫です😊\nZoomのアプリを入れておいていただくと、20時になったら案内のリンクを押すだけで入れます。\n分からないことがあれば、いつでもこのLINEで聞いてくださいね！' }),
      T({ fid: 'Ufdemo11', applicant_id: 'demo11', last_at: at(-1, 21, 12), summary: '日程を少し後ろにずらせますか？', intent: '日程変更したい', flag: 'guard', stage: 'ロードマップ面談', guard_why: '最後の連絡から15.8時間・夜をまたいでいる', draft_id: 'd2', draft_skill: '日程変更したい', draft_lv: '3',
        draft_text: '◯◯様\nご連絡ありがとうございます！日程の変更、もちろん大丈夫です。\nご都合のよい日時をいくつか教えていただけますか？' }),
      T({ fid: 'Ufdemo10', applicant_id: 'demo10', last_at: at(0, 9, 5), summary: '分割だと月いくらになりますか', intent: 'お金の質問', flag: 'human', stage: 'ロードマップ面談（2回目以降）', stop_reason: 'お金の話は人へ（止めるルール）' }),
      T({ fid: 'Ufdemo08', applicant_id: 'demo08', last_at: at(0, 10, 0), count: '', summary: '面談のフォロー（3日後に連絡）', intent: 'フォロー', flag: 'ai', stage: 'ロードマップ面談', draft_id: 'fu:demo', draft_skill: '面談のあとのフォロー', draft_lv: '1', draft_next: '9',
        draft_text: '◯◯様\n先日は面談のお時間をいただき、ありがとうございました！\nその後、ご検討の中で気になっていることや、もう少し聞いてみたいことはありませんか？\nどんな小さなことでも、このLINEで気軽に送ってくださいね😊' }),
      T({ fid: 'Ufdemo99', last_at: at(0, 11, 30), summary: '12/3の14時か、12/4の夜はどうですか？', intent: '希望の日時', flag: 'human', stage: 'セミナー参加' }),
      T({ fid: 'Ufdemo07', applicant_id: 'demo07', last_at: at(0, 8, 2), summary: 'リンク届きました！ありがとうございます', intent: '届いたか確認', flag: 'auto', action: '自動で返した（Lv3）', stage: 'ロードマップ面談' }),
      T({ fid: 'Ufdemo12', applicant_id: 'demo12', last_at: at(0, 7, 40), summary: 'スタンプ', intent: 'スタンプ', flag: 'none', stage: 'ロードマップ面談' })
    ];
    [dd, D].forEach(x => ((x && x.meetings) || []).forEach(m => { const t = threads.find(y => y.applicant_id === m.applicant_id); if (t) m.talk_url = t.talk_url; }));
    return {
      ok: true, mode: params.get('lg') === 'read' ? 'read' : 'send', now: at(0, 13), updated_at: at(0, 12, 59), threads, admin: isAdmin(),
      bridges: [
        { id: 'bk:demo', kind: 'booking', applicant_id: '', fid: 'Ufdemo99', member: me, title: '希望の日時が届きました', detail: '12/3の14時か、12/4の夜はどうですか？', due_at: at(0, 11, 30), status: 'open' },
        { id: 'cx:demo', kind: 'cancel', applicant_id: 'demo11', fid: 'Ufdemo11', member: me, title: '見送りの連絡がありました。この面談をキャンセルにしますか', detail: '今回はローンが通らず見送ります', due_at: at(0, 10, 20), status: 'open' },
        { id: 'fu:demo', kind: 'followup', applicant_id: 'demo08', fid: 'Ufdemo08', member: me, title: '面談のフォローの日です', detail: '3日後に連絡', due_at: at(0, 10, 0), draft_id: 'fu:demo', status: 'open' }],
      summaries: { demo03: { worry: '分割の回数と、毎月の支払い', temp: '前向き。家族に相談中', promise: '料金表を送る', msg_at: at(0, 12, 41) },
        demo10: { worry: '会社員を続けながらできるか', temp: '迷っている（時間）', promise: 'なし', msg_at: at(0, 9, 5) } },
      skills: [{ name: '日程変更したい', lv: 3, next: 0, pct: 100, used: 12, fixed: 1, teachers: 3 }, { name: '入室・接続', lv: 2, next: 3, pct: 85, used: 9, fixed: 1, teachers: 2 },
        { name: 'キャンセル・参加できない', lv: 2, next: 6, pct: 70, used: 5, fixed: 0, teachers: 1, need_ok: false }, { name: '面談のあとのフォロー', lv: 1, next: 9, pct: 10, used: 1, fixed: 0, teachers: 0 }],
      seeds: isAdmin() ? [{ name: '家族に相談したい', when: '「家族と相談します」と来たとき', sample: '◯◯様 もちろんです！ご家族に見ていただける資料もお送りしますね', count: 3, members: ['MIKA', 'RYO'] },
        { name: '支払いの不安', when: '「払えるか不安」と来たとき（借入れは勧めない）', sample: '◯◯様 不安なお気持ち、よく分かります。面談で一緒に考えましょう', count: 2, members: ['NAO'] }] : [],
      taught: { this_week: 3, last_week: 1, handled: 14 }
    };
  }
  function demoApi(action, body) {
    if (action === 'line_inbox') return Promise.resolve(JSON.parse(JSON.stringify(LG.demo || (LG.demo = demoData(DEMO_D || {}, demoNow())))));
    if (action === 'line_decide') { const id = 'demo-lg-' + Math.random().toString(36).slice(2, 8); DEMO_REQ[id] = { t: Date.now(), kind: 'lg', choice: body.choice }; return Promise.resolve({ ok: true, id }); }
    if (action === 'line_seed') return Promise.resolve({ ok: true, id: 'demo-sd' });
    return null;
  }
  function demoRequest(q, id) {
    if (!q || q.kind !== 'lg') return null;
    const n = { send: '（見本）送りました', edit: '（見本）直した文を送りました', direct: '（見本）送りました', skip: '返さないにしました', hand: '担当に任せました' }[q.choice];
    return { ok: true, request: { id, status: 'done', result_title: n, result_lines: '見本なので、どこにも送っていません' } };
  }

  // ---- 数字タブのいちばん下：教えた数（順位なし） ----
  function afterNum() {
    if (!on() || !LG.D || !LG.D.taught) return;
    const v = document.getElementById('v-num'); if (!v) return;
    const tk = LG.D.taught;
    v.insertAdjacentHTML('beforeend', '<div class="sec-h"><h2>LINE GO! で教えたこと</h2><span class="hint">比べるのは先週の自分</span></div><div class="lg-taught"><div><small>今週 教えた</small><b>' + (tk.this_week || 0) + '</b><span>回</span></div>' +
      '<div><small>先週</small><b>' + (tk.last_week || 0) + '</b><span>回</span></div><div><small>今週さばいた連絡</small><b>' + (tk.handled || 0) + '</b><span>通</span></div></div>');
  }

  window.LG = { on, load, syncTab, todayBand, cardLink, hasPrep, prepLabel, prepPane, view, click, demoApi, demoRequest, afterNum, state: LG };
})();
