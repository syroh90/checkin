'use strict';
// 알림 스케줄 → 캘린더 파일(.ics). 앱(app.js)과 사파리용 페이지(calendar.js)가 함께 쓴다.
const CHECKIN_ICS = (() => {
  const pad = n => String(n).padStart(2, '0');
  const NOUN = { smoke: '흡연 체크', drink: '음주 체크' };
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  function normalizeSchedule(s) {
    const one = o => (o && typeof o === 'object') ? {
      on: !!o.on,
      days: [...new Set((Array.isArray(o.days) ? o.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))],
      times: [...new Set((Array.isArray(o.times) ? o.times : []).filter(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].slice(0, 24),
    } : null;
    if (!s || typeof s !== 'object') return null;
    const smoke = one(s.smoke), drink = one(s.drink);
    return smoke && drink ? { smoke, drink } : null;
  }

  function firstMatchingDay(days) {
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      if (days.includes(d.getDay())) return d;
    }
    return now;
  }

  function build(schedule) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//checkin//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:체크인'];
    let n = 0;
    for (const type of ['smoke', 'drink']) {
      const s = schedule[type];
      if (!s || !s.on || !s.days.length || !s.times.length) continue;
      const byday = s.days.slice().sort().map(d => BYDAY[d]).join(',');
      const start = firstMatchingDay(s.days);
      const ymd = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}`;
      for (const t of s.times.slice().sort()) {
        lines.push('BEGIN:VEVENT',
          `UID:checkin-${type}-${t.replace(':', '')}@checkin.app`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${ymd}T${t.replace(':', '')}00`,
          'DURATION:PT5M',
          `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
          `SUMMARY:[체크인] ${NOUN[type]}`,
          'DESCRIPTION:홈 화면의 체크인 앱을 열어 기록하세요',
          'TRANSP:TRANSPARENT',
          'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${NOUN[type]} 시간이에요`, 'TRIGGER:PT0M', 'END:VALARM',
          'END:VEVENT');
        n++;
      }
    }
    lines.push('END:VCALENDAR');
    return { text: lines.join('\r\n') + '\r\n', n };
  }

  // 스케줄은 숫자·시각뿐이라 ASCII JSON → base64url 로 주소 # 뒤에 싣는다(# 뒤는 서버로 전송되지 않는다).
  function encode(schedule) {
    return btoa(JSON.stringify(schedule)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(str) {
    try {
      const b = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
      return normalizeSchedule(JSON.parse(atob(b)));
    } catch (e) { return null; }
  }
  function describe(schedule) {
    return ['smoke', 'drink'].map(type => {
      const s = schedule[type];
      const days = [1, 2, 3, 4, 5, 6, 0].filter(d => s.days.includes(d));
      const dayText = days.length === 7 ? '매일' : days.map(d => WD[d]).join('·');
      return { type, noun: NOUN[type], on: s.on && days.length > 0 && s.times.length > 0, dayText, times: s.times.slice().sort() };
    });
  }
  return { normalizeSchedule, build, encode, decode, describe, NOUN };
})();
