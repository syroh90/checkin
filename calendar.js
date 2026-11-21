'use strict';
// 사파리에서 열리는 페이지. 주소 # 뒤의 스케줄로 캘린더 파일을 만들고, 버튼을 누르면 사파리가 '캘린더에 추가' 창을 띄운다.
(() => {
  const box = document.getElementById('box');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const m = location.hash.match(/s=([A-Za-z0-9_-]+)/);
  const schedule = m ? CHECKIN_ICS.decode(m[1]) : null;
  if (!schedule) {
    box.innerHTML = '<div class="card"><b>알림 정보가 없어요</b><p class="muted small">체크인 앱의 <b>알림</b> 탭에서 버튼을 다시 눌러 주세요.</p></div>';
    return;
  }
  const { text, n } = CHECKIN_ICS.build(schedule);
  const rows = CHECKIN_ICS.describe(schedule).map(d => `<div class="row"><span class="t-${d.type}">${esc(d.noun)}</span><span class="times">${
    d.on ? `${esc(d.dayText)}<br>${d.times.map(esc).join(', ')}` : '<span class="muted">꺼짐</span>'
  }</span></div>`).join('');
  if (!n) {
    box.innerHTML = `<div class="card">${rows}</div><p class="muted small">켜져 있는 체크 시간이 없어요. 앱에서 시간을 켠 뒤 다시 눌러 주세요.</p>`;
    return;
  }
  box.innerHTML = `<div class="card">${rows}</div>
    <a class="btn primary" id="add">캘린더에 추가 (${n}개 반복 일정)</a>
    <button class="btn secondary" id="file" type="button">파일로 받기 (위 버튼이 안 될 때)</button>
    <div class="card small">
      <ol>
        <li>위 버튼을 누르면 일정 목록 창이 떠요.</li>
        <li><b>모두 추가</b>를 누르면 끝이에요. 이 페이지는 닫아도 돼요.</li>
        <li>스케줄을 바꿨다면 캘린더에서 예전 <b>[체크인]</b> 일정을 먼저 지워 주세요. 반복 일정은 '이후 모든 이벤트 삭제'로 한 번에 지울 수 있어요.</li>
      </ol>
    </div>`;
  document.getElementById('add').href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(text);
  document.getElementById('file').addEventListener('click', async () => {
    const file = new File([text], 'checkin-alarms.ics', { type: 'text/calendar' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  });
})();
