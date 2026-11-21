'use strict';
const KEY = 'checkin.v1';
const WD = ['일','월','화','수','목','금','토'];
const TYPES = {
  smoke: { label: '흡연', noun: '흡연 체크', useWord: '피운 날', lastWord: '마지막 흡연' },
  drink: { label: '음주', noun: '음주 체크', useWord: '마신 날', lastWord: '마지막 음주' },
};
// 단축어(흡연체크/음주체크)가 쓰던 값을 그대로 쓴다. 가져온 기록에 없는 값이 있으면 화면에 자동으로 추가된다.
const MOODS = ['보통','피곤','짜증','우울·처짐','불안','좋음'];
const FIELDS = {
  smoke: [
    { k: 'situation', label: '지금 상황', opts: ['기상 직후','식후','커피/음료','업무·공부 중','스트레스','운전·이동','휴식','지루함·대기','음주 중','자기 전','기타'] },
    { k: 'mood', label: '기분', opts: MOODS },
    { k: 'amount', label: '피운 개비', opts: ['0개비','1개비','2개비','3개비 이상'] },
    { k: 'status', label: '지금 상태', opts: ['안 피움 (참음)','피울 것 같음','지금 피우는 중/직후'] },
  ],
  drink: [
    { k: 'situation', label: '지금 상황', opts: ['주말 여유','지루함·심심함','스트레스','모임·회식','식사 반주','피곤함','기타'] },
    { k: 'mood', label: '기분', opts: MOODS },
    { k: 'want', label: '당기는 술', opts: ['안 당김','맥주','소주','와인','위스키','막걸리','기타'] },
    { k: 'amount', label: '마신 양', opts: ['안 마심','1~2잔','3~4잔','5잔 이상'] },
    { k: 'status', label: '지금 상태', opts: ['안 마심 (참음)','마실 것 같음','지금 마시는 중/직후'] },
  ],
};
const DEFAULTS = {
  smoke: { situation: '', mood: '보통', amount: '0개비', status: '안 피움 (참음)' },
  drink: { situation: '', mood: '보통', want: '안 당김', amount: '안 마심', status: '안 마심 (참음)' },
};
const CRAVE_LABEL = ['전혀 없음','아주 약함','약함','약함','조금','보통','조금 강함','강함','강함','매우 강함','참기 힘듦'];

const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const toStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayOf = d => toStr(d).slice(0, 10);
function parseStr(s) {
  const [a, b = '00:00'] = s.split(' ');
  const [y, m, d] = a.split('-').map(Number);
  const [h, mi] = b.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
}
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function daysBetween(aKey, bKey) { return Math.round((parseStr(bKey) - parseStr(aKey)) / 86400000); }
function dateLabel(key) { const d = parseStr(key); return `${d.getMonth()+1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; }
function dayLabel(key) {
  const today = dayOf(new Date());
  const diff = daysBetween(key, today);
  if (diff === 0) return '오늘 · ' + dateLabel(key);
  if (diff === 1) return '어제 · ' + dateLabel(key);
  return dateLabel(key);
}

// 알림은 아이폰 캘린더의 '흡연체크' 캘린더(iCloud)가 보낸다. 시간을 바꿀 때는 이 값과 캘린더를 함께 고친다.
const SCHEDULE = {
  smoke: { days: [0,1,2,3,4,5,6], times: ['09:00','13:00','17:00','21:00'] },
  drink: { days: [5,6], times: ['21:00'] },
};
function freshState() {
  return { v: 1, entries: [], lastBackup: null, lastType: 'smoke' };
}
function load() {
  const base = freshState();
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  if (!s || typeof s !== 'object') return base;
  const merged = { ...base, ...s, entries: Array.isArray(s.entries) ? s.entries : [] };
  delete merged.schedule; // 예전 버전이 저장해 둔 스케줄은 쓰지 않는다
  return merged;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch (e) { toast('저장하지 못했어요. 아이폰 저장 공간을 확인해 주세요'); return false; }
}
function sortEntries() { state.entries.sort((a, b) => a.at.localeCompare(b.at)); }

let state = load();
let form = blankForm(state.lastType === 'drink' ? 'drink' : 'smoke');
let view = 'check';
let logFilter = 'all';

function blankForm(type) { return { type, at: null, craving: null, memo: '', editingId: null, ...DEFAULTS[type] }; }

function isUse(e) {
  if (e.type === 'smoke') return (!!e.amount && e.amount !== '0개비') || /피우는 중/.test(e.status || '');
  return (!!e.amount && e.amount !== '안 마심') || /마시는 중/.test(e.status || '');
}
function lastUse(type) {
  for (let i = state.entries.length - 1; i >= 0; i--) { const e = state.entries[i]; if (e.type === type && isUse(e)) return e; }
  return null;
}

// 오늘 스케줄 칸마다 기록이 있었는지 본다. 정해진 시각 앞뒤 60분 안의 기록 하나가 한 칸을 채운다.
function slotStatus(type, key, now) {
  const s = SCHEDULE[type];
  const d = parseStr(key);
  if (!s.days.includes(d.getDay())) return [];
  const times = state.entries.filter(e => e.type === type && e.at.startsWith(key)).map(e => parseStr(e.at).getTime());
  const used = new Set();
  return s.times.slice().sort().map(t => {
    const st = parseStr(key + ' ' + t).getTime();
    let done = false;
    for (let i = 0; i < times.length; i++) {
      if (!used.has(i) && Math.abs(times[i] - st) <= 3600000) { used.add(i); done = true; break; }
    }
    return { t, state: done ? 'done' : (now > st + 3600000 ? 'missed' : 'upcoming') };
  });
}
function nextCheck() {
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = addDays(now, i);
    const key = dayOf(d);
    let best = null;
    for (const type of ['smoke', 'drink']) {
      const s = SCHEDULE[type];
      if (!s.days.includes(d.getDay())) continue;
      for (const t of s.times) {
        if (parseStr(key + ' ' + t) <= now) continue;
        if (!best || t < best.t) best = { type, t };
      }
    }
    if (best) {
      const when = i === 0 ? '오늘' : i === 1 ? '내일' : dateLabel(key);
      return { ...best, when: `${when} ${best.t}` };
    }
  }
  return null;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- 체크 화면 ---------- */
function renderToday() {
  const el = $('#today');
  if (form.editingId) { el.innerHTML = ''; return; }
  const now = Date.now();
  const key = dayOf(new Date());
  const rows = [];
  for (const type of ['smoke', 'drink']) {
    const slots = slotStatus(type, key, now);
    if (!slots.length) continue;
    rows.push(`<div class="slotrow"><span class="t-${type}">${TYPES[type].label}</span><span class="slots">${
      slots.map(s => `<span class="slot ${s.state}">${s.t}${s.state === 'done' ? ' ✓' : s.state === 'missed' ? ' 놓침' : ''}</span>`).join('')
    }</span></div>`);
  }
  const streaks = ['smoke', 'drink'].map(type => {
    if (!state.entries.some(e => e.type === type)) return '';
    const last = lastUse(type);
    if (!last) return `<span>${TYPES[type].lastWord} <b>기록 없음</b></span>`;
    const diff = daysBetween(last.at.slice(0, 10), key);
    return `<span>${TYPES[type].lastWord} <b>${diff === 0 ? '오늘' : diff + '일 전'}</b></span>`;
  }).join('');
  const nx = nextCheck();
  el.innerHTML = `<div class="card today">
    <div class="row"><b>${dayLabel(key)}</b>${nx ? `<span class="muted small">다음 체크 ${esc(nx.when.replace(/^오늘 /, ''))}</span>` : ''}</div>
    ${rows.join('') || '<p class="muted small" style="margin:8px 0 0">오늘은 정해진 체크 시간이 없어요</p>'}
    ${streaks ? `<div class="streaks">${streaks}</div>` : ''}
  </div>`;
}

function renderForm() {
  const f = form;
  const editing = !!f.editingId;
  const atVal = (f.at || toStr(new Date())).replace(' ', 'T');
  $('#form').innerHTML = `
    ${editing
      ? `<div class="editbar"><span>${esc(dateLabel(f.at.slice(0, 10)))} ${esc(f.at.slice(11))} ${TYPES[f.type].label} 기록 수정 중</span><button class="link" data-act="cancel-edit">취소</button></div>`
      : `<div class="seg" role="group" aria-label="기록 종류">${
          Object.keys(TYPES).map(t => `<button data-act="type" data-v="${t}" class="seg-${t}" aria-pressed="${f.type === t}">${TYPES[t].label}</button>`).join('')
        }</div>`}
    <div class="card" id="crave-card">
      <div class="q"><span>지금 얼마나 당겨요?</span><b class="crave-val">${f.craving == null ? '' : f.craving}<small>${f.craving == null ? '0~10에서 골라 주세요' : CRAVE_LABEL[f.craving]}</small></b></div>
      <div class="crave">${Array.from({ length: 11 }, (_, i) => `<button data-act="crave" data-v="${i}" aria-pressed="${f.craving === i}" aria-label="갈망 ${i}">${i}</button>`).join('')}</div>
    </div>
    ${FIELDS[f.type].map(fd => {
      const opts = fd.opts.slice();
      const cur = f[fd.k];
      if (cur && !opts.includes(cur)) opts.push(cur);
      return `<div class="card"><div class="q"><span>${fd.label}</span>${fd.k === 'situation' ? '<small class="muted">선택</small>' : ''}</div><div class="chips">${
        opts.map(o => `<button class="chip" data-act="pick" data-k="${fd.k}" data-v="${esc(o)}" aria-pressed="${cur === o}">${esc(o)}</button>`).join('')
      }</div></div>`;
    }).join('')}
    <div class="card">
      <label class="q" for="memo"><span>메모</span><small class="muted">선택</small></label>
      <textarea id="memo" rows="3" placeholder="무슨 일이 있었는지, 어떻게 넘겼는지">${esc(f.memo)}</textarea>
    </div>
    <div class="card">
      <label class="q" for="at"><span>기록 시각</span><small class="muted">${f.at ? '직접 바꿈' : '저장하는 시각'}</small></label>
      <input id="at" type="datetime-local" value="${atVal}">
    </div>
    <button class="primary" data-act="save-entry">${editing ? '수정 저장' : '기록하기'}</button>
    ${editing ? '<button class="danger" data-act="delete-entry">이 기록 삭제</button>' : ''}
  `;
}

function saveEntry() {
  if (form.craving == null) {
    toast('갈망 정도를 먼저 골라 주세요');
    $('#crave-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const memoEl = $('#memo');
  if (memoEl) form.memo = memoEl.value;
  const e = {
    id: form.editingId || uid(),
    type: form.type,
    at: form.at || toStr(new Date()),
    craving: form.craving,
    situation: form.situation || '',
    mood: form.mood || '',
    amount: form.amount || '',
    status: form.status || '',
    memo: (form.memo || '').trim(),
  };
  if (form.type === 'drink') e.want = form.want || '';
  const wasEdit = !!form.editingId;
  if (wasEdit) {
    const i = state.entries.findIndex(x => x.id === form.editingId);
    if (i >= 0) state.entries[i] = e; else state.entries.push(e);
  } else {
    state.entries.push(e);
  }
  sortEntries();
  if (!save()) return;
  askPersist();
  toast(wasEdit ? '수정했어요' : `${TYPES[e.type].label} 기록했어요`);
  form = blankForm(form.type);
  if (wasEdit) go('log'); else { render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}

function startEdit(id) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return;
  form = { ...blankForm(e.type), ...e, editingId: e.id };
  go('check');
}

/* ---------- 기록 화면 ---------- */
function chartSVG(types) {
  const today = new Date();
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(dayOf(addDays(today, -i)));
  const W = 328, H = 136, top = 10, bottom = 26, ch = H - top - bottom, gw = W / 14;
  const avgs = [];
  let out = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="최근 14일 하루 평균 갈망 막대그래프">`;
  for (const g of [5, 10]) {
    const y = top + ch - (g / 10) * ch;
    out += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" class="grid"/><text x="${W - 1}" y="${y - 3}" class="ax" text-anchor="end">${g}</text>`;
  }
  out += `<line x1="0" x2="${W}" y1="${top + ch}" y2="${top + ch}" class="grid"/>`;
  days.forEach((d, i) => {
    const bw = types.length === 2 ? (gw - 8) / 2 : gw - 10;
    types.forEach((ty, j) => {
      const es = state.entries.filter(e => e.type === ty && e.at.startsWith(d));
      if (!es.length) return;
      const avg = es.reduce((a, e) => a + (+e.craving || 0), 0) / es.length;
      avgs.push(avg);
      const h = Math.max(2, (avg / 10) * ch);
      const x = i * gw + (types.length === 2 ? 4 + j * bw : 5);
      out += `<rect x="${x.toFixed(1)}" y="${(top + ch - h).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="bar-${ty}"><title>${dateLabel(d)} ${TYPES[ty].label} 평균 ${avg.toFixed(1)}</title></rect>`;
      if (es.some(isUse)) out += `<circle cx="${(x + (bw - 1) / 2).toFixed(1)}" cy="${H - 16}" r="2.6" class="dot-${ty}"/>`;
    });
    if (i === 0 || i === 7 || i === 13) {
      const dd = parseStr(d);
      out += `<text x="${(i * gw + gw / 2).toFixed(1)}" y="${H - 2}" class="ax" text-anchor="middle">${i === 13 ? '오늘' : `${dd.getMonth() + 1}/${dd.getDate()}`}</text>`;
    }
  });
  return out + '</svg>';
}

function entryRow(e) {
  const tags = [e.situation, e.mood && e.mood !== '보통' ? e.mood : '', e.type === 'drink' && e.want && e.want !== '안 당김' ? e.want + ' 당김' : '', e.amount, e.status].filter(Boolean);
  return `<button class="entry${isUse(e) ? ' used' : ''}" data-act="edit" data-id="${esc(e.id)}">
    <span class="e-time">${esc(e.at.slice(11))}</span>
    <span class="e-crave e-${e.type}" title="갈망">${esc(e.craving)}</span>
    <span class="e-body"><span class="e-tags"><b class="t-${e.type}">${TYPES[e.type].label}</b>${tags.map(esc).join(' · ')}</span>${e.memo ? `<span class="e-memo">${esc(e.memo)}</span>` : ''}</span>
  </button>`;
}

function renderLog() {
  const el = $('#view-log');
  const types = logFilter === 'all' ? ['smoke', 'drink'] : [logFilter];
  const ents = state.entries.filter(e => types.includes(e.type));
  const filterHtml = `<div class="chips" style="margin-bottom:12px">${
    [['all', '전체'], ['smoke', '흡연'], ['drink', '음주']].map(([k, l]) => `<button class="chip" data-act="filter" data-v="${k}" aria-pressed="${logFilter === k}">${l}</button>`).join('')
  }</div>`;
  if (!ents.length) {
    el.innerHTML = `<h1>기록</h1>${filterHtml}<div class="card empty"><p><b>아직 기록이 없어요</b></p><p class="muted">단축어로 남긴 기록이 있으면 <b>백업</b> 탭에서 가져올 수 있어요.</p></div>`;
    return;
  }
  const since = dayOf(addDays(new Date(), -6));
  const recent = ents.filter(e => e.at.slice(0, 10) >= since);
  const held = recent.filter(e => /참음/.test(e.status || '')).length;
  const useDays = new Set(recent.filter(isUse).map(e => e.at.slice(0, 10))).size;
  const avg = recent.length ? (recent.reduce((a, e) => a + (+e.craving || 0), 0) / recent.length).toFixed(1) : '–';
  const useWord = types.length === 2 ? '피움·마심' : TYPES[types[0]].useWord;
  const groups = {};
  for (const e of ents.slice().reverse()) (groups[e.at.slice(0, 10)] = groups[e.at.slice(0, 10)] || []).push(e);
  el.innerHTML = `<h1>기록</h1>${filterHtml}
    <div class="card">
      <div class="q"><span>최근 7일</span><small class="muted">기록 ${ents.length}건 중</small></div>
      <div class="stats">
        <div><b>${recent.length}</b><span>체크</span></div>
        <div><b>${held}</b><span>참음</span></div>
        <div><b>${useDays}</b><span>${useWord}</span></div>
        <div><b>${avg}</b><span>평균 갈망</span></div>
      </div>
    </div>
    <div class="card">
      <div class="q"><span>최근 14일 갈망</span></div>
      ${chartSVG(types)}
      <div class="legend">${types.map(t => `<span><i class="bar-${t}" style="background:var(--${t})"></i>${TYPES[t].label} 하루 평균</span>`).join('')}<span>● 실제로 ${types.length === 2 ? '피우거나 마신' : types[0] === 'smoke' ? '피운' : '마신'} 날</span></div>
    </div>
    ${Object.entries(groups).map(([k, es]) => `<h3 class="day">${dayLabel(k)}</h3><div class="card list">${es.map(entryRow).join('')}</div>`).join('')}
    <p class="muted small" style="text-align:center;margin-top:16px">기록을 누르면 고치거나 지울 수 있어요</p>`;
}

/* ---------- 알림 화면 ---------- */
function renderAlarm() {
  const nx = nextCheck();
  const dayText = days => days.length === 7 ? '매일' : [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)).map(d => WD[d]).join('·');
  $('#view-alarm').innerHTML = `<h1>알림 스케줄</h1>
    <p class="muted" style="margin-top:-4px">${nx ? `다음 체크 · <b style="color:var(--ink)">${esc(nx.when)} ${TYPES[nx.type].noun}</b>` : '정해진 체크 시간이 없어요'}</p>
    ${['smoke', 'drink'].map(type => {
      const s = SCHEDULE[type];
      return `<div class="card">
        <div class="row"><b class="t-${type}" style="font-size:17px">${TYPES[type].noun}</b><span class="muted small">${dayText(s.days)}</span></div>
        <div class="chips" style="margin-top:12px">${s.times.map(t => `<span class="chip">${t}</span>`).join('')}</div>
      </div>`;
    }).join('')}
    <div class="card">
      <b>알림은 아이폰 캘린더가 보내요</b>
      <p class="muted small">위 시간에 아이폰 캘린더의 <b>흡연체크</b> 캘린더가 알림을 보내요. 이 화면은 그 시간표를 보여 주고, 체크 화면에서 기록한 칸(✓)과 놓친 칸을 표시하는 데 써요.</p>
      <p class="muted small">시간을 바꾸고 싶으면 Claude에게 말해 주세요. 캘린더와 앱을 함께 고쳐요.</p>
    </div>`;
}

/* ---------- 가져오기 · 백업 ---------- */
// 단축어 CSV: 한 기록이 "YYYY-MM-DD HH:MM," 으로 시작하고, 메모 안의 줄바꿈은 따옴표 없이 다음 줄로 이어진다.
function parseShortcutCSV(text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const starts = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2},/;
  const recs = [];
  for (const line of lines) {
    if (starts.test(line)) recs.push(line);
    else if (recs.length) recs[recs.length - 1] += '\n' + line;
  }
  const out = [];
  let skipped = 0;
  for (const rec of recs) {
    const p = rec.split(',');
    const craving = parseInt(p[1], 10);
    if (Number.isNaN(craving) || p.length < 3) { skipped++; continue; }
    const clean = m => { const t = m.replace(/\s+$/, '').replace(/^\s+/, ''); return t === '-' ? '' : t; };
    if (p.length >= 7 && /개비/.test(p[4])) {
      out.push({ type: 'smoke', at: p[0], craving, situation: p[2], mood: p[3], amount: p[4], status: p[5], memo: clean(p.slice(6).join(',')) });
    } else if (p.length >= 8) {
      out.push({ type: 'drink', at: p[0], craving, situation: p[2], mood: p[3], want: p[4], amount: p[5], status: p[6], memo: clean(p.slice(7).join(',')) });
    } else skipped++;
  }
  return { entries: out, skipped };
}
// 밖에서 들어온 기록(CSV·백업 파일)은 형식을 검사하고 글자 수를 제한해서 넣는다.
const AT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
function normalizeEntry(e) {
  if (!e || typeof e !== 'object' || (e.type !== 'smoke' && e.type !== 'drink')) return null;
  if (typeof e.at !== 'string' || !AT_RE.test(e.at)) return null;
  const c = Number(e.craving);
  if (!Number.isInteger(c) || c < 0 || c > 10) return null;
  const str = (v, max) => (v == null ? '' : String(v)).slice(0, max);
  const out = {
    id: /^[a-z0-9]{4,40}$/i.test(String(e.id || '')) ? String(e.id) : uid(),
    type: e.type, at: e.at, craving: c,
    situation: str(e.situation, 60), mood: str(e.mood, 60), amount: str(e.amount, 60), status: str(e.status, 60),
    memo: str(e.memo, 4000),
  };
  if (e.type === 'drink') out.want = str(e.want, 60);
  return out;
}
const dedupeKey = e => [e.type, e.at, e.craving, e.amount, e.status].join('|');
function mergeEntries(list) {
  const seen = new Set(state.entries.map(dedupeKey));
  let added = 0, dup = 0;
  const count = { smoke: 0, drink: 0 };
  let invalid = 0;
  for (const raw of list) {
    const e = normalizeEntry(raw);
    if (!e) { invalid++; continue; }
    const k = dedupeKey(e);
    if (seen.has(k)) { dup++; continue; }
    seen.add(k);
    state.entries.push(e);
    count[e.type]++;
    added++;
  }
  sortEntries();
  return { added, dup, count, invalid };
}
function toShortcutCSV(type) {
  return state.entries.filter(e => e.type === type).map(e => {
    const memo = e.memo ? e.memo : '-';
    const cols = type === 'smoke'
      ? [e.at, e.craving, e.situation, e.mood, e.amount, e.status, memo]
      : [e.at, e.craving, e.situation, e.mood, e.want, e.amount, e.status, memo];
    return cols.map(c => String(c == null ? '' : c)).join(',');
  }).join('\n') + '\n';
}
async function offerFile(name, text, mime) {
  const file = new File([text], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; }
    catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return true;
}
function ago(iso) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? '오늘' : d + '일 전';
}
function askPersist() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

function renderMore() {
  const n = state.entries.length;
  const a = state.entries.filter(e => e.type === 'smoke').length;
  $('#view-more').innerHTML = `<h1>가져오기 · 백업</h1>
    <div class="card">
      <b>단축어 기록 가져오기</b>
      <p class="muted small">파일 앱에서 <b>iCloud Drive → Shortcuts → 흡연기록</b>(또는 <b>음주기록</b>)의 <b>log.csv</b>를 고르세요. 두 파일을 함께 골라도 되고, 이미 가져온 기록은 건너뛰어요.</p>
      <label class="primary">CSV 파일 고르기<input type="file" id="imp-csv" class="vh" accept=".csv,text/csv,text/plain,text/comma-separated-values" multiple></label>
      <p class="muted small" id="imp-result" role="status"></p>
    </div>
    <div class="card">
      <b>백업</b>
      <p class="muted small">기록은 이 아이폰의 홈 화면 앱 안에만 저장돼요. 홈 화면 아이콘을 지우면 기록도 함께 지워지니 가끔 백업해 두세요. ${state.lastBackup ? `마지막 백업은 <b>${ago(state.lastBackup)}</b>이에요.` : '아직 백업한 적이 없어요.'}</p>
      <div class="btnrow"><button class="secondary" data-act="exp-csv" data-type="smoke">흡연 CSV</button><button class="secondary" data-act="exp-csv" data-type="drink">음주 CSV</button></div>
      <p class="muted small" style="margin:6px 2px 0">CSV는 단축어와 같은 형식이라 iCloud Drive의 log.csv 자리에 그대로 둘 수 있어요.</p>
      <button class="secondary" data-act="exp-json">전체 백업 파일 (스케줄 포함)</button>
      <label class="secondary">백업 파일로 되살리기<input type="file" id="imp-json" class="vh" accept=".json,application/json"></label>
    </div>
    <div class="card">
      <b>저장 상태</b>
      <p class="muted small">기록 ${n}건 (흡연 ${a} · 음주 ${n - a})</p>
      <p class="muted small" id="persist"></p>
      <button class="danger" data-act="wipe">모든 기록 지우기</button>
    </div>`;
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then(p => {
      const el = $('#persist');
      if (el) el.textContent = p ? '저장 공간 보호가 켜져 있어요 (브라우저가 기록을 임의로 지우지 않아요).' : '';
    }).catch(() => {});
  }
}

async function importCSVFiles(files) {
  const res = $('#imp-result');
  let all = [], skipped = 0;
  for (const f of files) {
    const text = await f.text();
    const r = parseShortcutCSV(text);
    all = all.concat(r.entries);
    skipped += r.skipped;
  }
  const m = mergeEntries(all);
  save();
  askPersist();
  const parts = [];
  if (m.count.smoke) parts.push(`흡연 ${m.count.smoke}건`);
  if (m.count.drink) parts.push(`음주 ${m.count.drink}건`);
  let msg = m.added ? `${parts.join(', ')}을 가져왔어요.` : '새로 가져올 기록이 없어요.';
  if (m.dup) msg += ` 이미 있던 ${m.dup}건은 건너뛰었어요.`;
  skipped += m.invalid;
  if (skipped) msg += ` 형식이 다른 ${skipped}줄은 읽지 않았어요.`;
  renderMore();
  const el = $('#imp-result');
  if (el) el.textContent = msg;
  toast(m.added ? `${m.added}건 가져왔어요` : '새 기록이 없어요');
}
async function restoreJSON(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== 'checkin' || !Array.isArray(data.entries)) throw new Error('bad');
    const m = mergeEntries(data.entries.filter(e => e && (e.type === 'smoke' || e.type === 'drink') && typeof e.at === 'string'));
    save();
    toast(`${m.added}건을 되살렸어요`);
    render();
  } catch (e) {
    toast('체크인 백업 파일이 아니에요');
  }
}

/* ---------- 화면 전환 ---------- */
function go(v) {
  view = v;
  for (const id of ['check', 'log', 'alarm', 'more']) $('#view-' + id).hidden = id !== v;
  document.querySelectorAll('.tabs button').forEach(b => {
    if (b.dataset.v === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  render();
  window.scrollTo(0, 0);
}
function render() {
  document.body.dataset.type = form.type;
  if (view === 'check') { renderToday(); renderForm(); }
  if (view === 'log') renderLog();
  if (view === 'alarm') renderAlarm();
  if (view === 'more') renderMore();
}

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.tagName === 'INPUT') return;
  const act = b.dataset.act, v = b.dataset.v, type = b.dataset.type;
  const memoEl = $('#memo');
  if (memoEl) form.memo = memoEl.value;
  switch (act) {
    case 'tab':
      if (v === 'check' && view === 'check' && form.editingId) { form = blankForm(form.type); }
      go(v); break;
    case 'type':
      form = { ...blankForm(v), craving: form.craving, memo: form.memo, at: form.at };
      state.lastType = v; save(); render(); break;
    case 'crave': form.craving = +v; renderForm(); break;
    case 'pick':
      form[b.dataset.k] = (b.dataset.k === 'situation' && form.situation === v) ? '' : v;
      renderForm(); break;
    case 'save-entry': saveEntry(); break;
    case 'cancel-edit': form = blankForm(form.type); go('log'); break;
    case 'delete-entry':
      if (confirm('이 기록을 지울까요?')) {
        state.entries = state.entries.filter(e => e.id !== form.editingId);
        save(); toast('지웠어요'); form = blankForm(form.type); go('log');
      }
      break;
    case 'edit': startEdit(b.dataset.id); break;
    case 'filter': logFilter = v; renderLog(); break;
    case 'exp-csv': {
      if (!state.entries.some(e => e.type === type)) { toast(`${TYPES[type].label} 기록이 없어요`); break; }
      offerFile(type === 'smoke' ? 'smoke-log.csv' : 'drink-log.csv', toShortcutCSV(type), 'text/csv').then(ok => {
        if (ok) { state.lastBackup = new Date().toISOString(); save(); renderMore(); }
      });
      break;
    }
    case 'exp-json': {
      const data = { app: 'checkin', v: 1, exportedAt: new Date().toISOString(), entries: state.entries };
      offerFile(`checkin-backup-${dayOf(new Date())}.json`, JSON.stringify(data, null, 1), 'application/json').then(ok => {
        if (ok) { state.lastBackup = new Date().toISOString(); save(); renderMore(); }
      });
      break;
    }
    case 'wipe':
      if (confirm('모든 기록을 지울까요? 되돌릴 수 없어요.') && confirm('정말 지울까요? 백업이 없으면 기록이 사라져요.')) {
        state.entries = []; save(); toast('모든 기록을 지웠어요'); render();
      }
      break;
  }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'at') { form.at = t.value ? t.value.replace('T', ' ').slice(0, 16) : null; renderForm(); }
  if (t.id === 'imp-csv' && t.files && t.files.length) importCSVFiles(Array.from(t.files));
  if (t.id === 'imp-json' && t.files && t.files[0]) restoreJSON(t.files[0]);
});
document.addEventListener('input', ev => { if (ev.target.id === 'memo') form.memo = ev.target.value; });
document.addEventListener('visibilitychange', () => { if (!document.hidden && view === 'check') renderToday(); });

render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // 새 버전이 설치되면 한 번만 새로고침해서 바로 적용한다 (처음 설치할 때는 새로고침하지 않는다).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
