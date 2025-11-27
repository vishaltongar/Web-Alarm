//   Utilities & Clock Display


const $ = sel => document.querySelector(sel);

const hhmmEl = $('#hhmm'), secEl = $('#seconds'), ampmEl = $('#ampm'), dateEl = $('#dateStr');

const addForm = $('#addForm'), alarmTimeInput = $('#alarmTime'), alarmLabelInput = $('#alarmLabel'), addAlarmBtn = $('#addAlarmBtn');

const alarmsListEl = $('#alarmsList'), showAlarmsBtn = $('#showAlarmsBtn'), addNowBtn = $('#addNowBtn');

const modalBack = $('#modalBack'), ringTitle = $('#ringTitle'), ringSubtitle = $('#ringSubtitle');

const dismissBtn = $('#dismissBtn'), snoozeBtn = $('#snoozeBtn');

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function formatDate(d) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function updateClock() {
  const now = new Date();
  let h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  let displayH = h % 12; if (displayH === 0) displayH = 12;
  hhmmEl.textContent = `${pad(displayH)}:${pad(m)}`;
  secEl.textContent = pad(s);
  ampmEl.textContent = ampm;
  dateEl.textContent = formatDate(now);
}

updateClock();
setInterval(updateClock, 1000);


//    Alarm storage and helpers

const STORAGE_KEY = 'my_clock_alarms_v1';
let alarms = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

function saveAlarms() { localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function renderAlarms() {
  if (alarms.length === 0) {
    alarmsListEl.innerHTML = '<div class="small" style="padding:10px;color:var(--muted)">No alarms set.</div>';
    return;
  }
  alarmsListEl.innerHTML = '';
  alarms.sort((a, b) => a.time.localeCompare(b.time));
  alarms.forEach(a => {
    const row = document.createElement('div'); row.className = 'alarm';
    const left = document.createElement('div'); left.className = 'meta';
    left.innerHTML = `<div>
      <div class="timeLabel">${a.time}</div>
      <div class="small">${a.label || 'Alarm'} • ${a.repeat === 'daily' ? 'Daily' : 'Once'}</div>
    </div>`;
    const right = document.createElement('div'); right.className = 'switch';
    const toggle = document.createElement('button'); toggle.className = 'tiny btn ghost';
    toggle.textContent = a.enabled ? 'On' : 'Off';
    toggle.addEventListener('click', () => { a.enabled = !a.enabled; a.lastTriggered = null; saveAlarms(); renderAlarms(); });
    const del = document.createElement('button'); del.className = 'tiny btn ghost'; del.textContent = 'Delete';
    del.addEventListener('click', () => { alarms = alarms.filter(x => x.id !== a.id); saveAlarms(); renderAlarms(); });
    right.append(toggle, del);
    row.append(left, right);
    alarmsListEl.append(row);
  });
}


//    Add alarms


addAlarmBtn.addEventListener('click', () => {
  const time = alarmTimeInput.value;
  if (!time) { alert('Please pick a time for the alarm.'); return; }
  const label = alarmLabelInput.value.trim();
  const repeat = $('#repeatSelect').value;
  const newA = { id: uid(), time, label, enabled: true, repeat, lastTriggered: null };
  alarms.push(newA); saveAlarms(); renderAlarms();
  alarmLabelInput.value = '';
  alert('Alarm set for ' + time + (label ? ' — ' + label : ''));
});

addNowBtn.addEventListener('click', () => {
  const d = new Date(); d.setMinutes(d.getMinutes() + 1);
  const hh = pad(d.getHours()), mm = pad(d.getMinutes());
  alarmTimeInput.value = `${hh}:${mm}`;
  alarmLabelInput.value = 'Quick alarm';
});


//    Alarm checking (every second)


let currentlyRinging = null;
const checkInterval = setInterval(checkAlarms, 1000);

function checkAlarms() {
  const now = new Date();
  const HH = pad(now.getHours()), MM = pad(now.getMinutes());
  const nowStr = `${HH}:${MM}`;
  alarms.forEach(a => {
    if (!a.enabled) return;
    if (a.lastTriggered === nowStr) return;
    if (a.time === nowStr) {
      a.lastTriggered = nowStr;
      saveAlarms();
      triggerAlarm(a);
      if (a.repeat === 'once') { a.enabled = false; saveAlarms(); renderAlarms(); }
    }
  });
}


//    Ringing behavior (Web Audio)


let audioCtx = null, osc = null, gainNode = null;

function ensureAudio() {
  if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
}

function playBeepLoop() {
  ensureAudio();
  osc = audioCtx.createOscillator();
  gainNode = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  osc.connect(gainNode); gainNode.connect(audioCtx.destination);
  osc.start();
  let on = true;
  gainNode.gain.value = 0;
  const pattern = () => {
    if (!gainNode) return;
    gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.02);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.18);
  };
  pattern();
  osc._patternInterval = setInterval(pattern, 400);
}

function stopBeep() {
  if (osc) {
    clearInterval(osc._patternInterval);
    try { osc.stop(); } catch (e) { }
    osc.disconnect();
    osc = null;
  }
  if (gainNode) { gainNode.disconnect(); gainNode = null; }
}


//    Trigger / Modal controls


function triggerAlarm(alarm) {
  currentlyRinging = alarm;
  ringTitle.textContent = alarm.label || 'Alarm';
  ringSubtitle.textContent = `Time: ${alarm.time}`;
  modalBack.style.display = 'flex'; modalBack.setAttribute('aria-hidden', 'false');
  ensureAudio();
  if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
    audioCtx.resume().catch(() => { /* ignore */ });
  }
  playBeepLoop();
}

dismissBtn.addEventListener('click', () => {
  stopBeep();
  modalBack.style.display = 'none'; modalBack.setAttribute('aria-hidden', 'true');
  currentlyRinging = null;
});

snoozeBtn.addEventListener('click', () => {
  if (!currentlyRinging) return;
  const d = new Date();
  d.setMinutes(d.getMinutes() + 5);
  const newTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const snoozeAlarm = { id: uid(), time: newTime, label: (currentlyRinging.label || 'Snoozed alarm'), enabled: true, repeat: 'once', lastTriggered: null };
  alarms.push(snoozeAlarm);
  saveAlarms(); renderAlarms();
  stopBeep();
  modalBack.style.display = 'none'; modalBack.setAttribute('aria-hidden', 'true');
  currentlyRinging = null;
  alert('Snoozed for 5 minutes (' + newTime + ')');
});


//    UI: Show/hide alarms


showAlarmsBtn.addEventListener('click', () => {
  if (alarmsListEl.style.display === 'none' || alarmsListEl.style.display === '') {
    alarmsListEl.style.display = 'block';
    showAlarmsBtn.textContent = 'Hide Alarms';
    renderAlarms();
  } else {
    alarmsListEl.style.display = 'none';
    showAlarmsBtn.textContent = 'Show Alarms';
  }
});

renderAlarms();

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalBack.style.display === 'flex') {
    dismissBtn.click();
  }
});

document.addEventListener('click', () => { try { ensureAudio(); } catch (e) { } }, { once: true });