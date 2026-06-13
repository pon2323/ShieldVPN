const $ = s => document.querySelector(s);
const steps = [...document.querySelectorAll('.step')];
let mode = 'install';

$('#minBtn').onclick = () => window.ShieldLauncher.minimize();
$('#closeBtn').onclick = () => window.ShieldLauncher.close();
$('#mainActionBtn').onclick = () => installOrUpdate();
$('#openBtn').onclick = () => openClient();

window.ShieldLauncher.onProgress(data => {
  setStep(1);
  setProgress(data.percent || 0);
  const mb = (data.loaded / 1024 / 1024).toFixed(1);
  const total = data.total ? (data.total / 1024 / 1024).toFixed(1) : '?';
  setStatus('Загружаю ShieldVPN Client…', `${mb} / ${total} MB`);
});

init();

async function init() {
  const meta = await window.ShieldLauncher.meta();
  $('#launcherVersion').textContent = 'Launcher v' + meta.appVersion;
  $('#sourceText').textContent = short(meta.manifestUrl);
  await refreshState();
}

async function refreshState() {
  setStep(0); setProgress(0); setDetails('');
  setStatus('Проверяю состояние…', 'Смотрю установлен ли клиент и доступна ли новая версия.');
  $('#mainActionBtn').disabled = true;
  $('#openBtn').disabled = true;

  const res = await window.ShieldLauncher.check();
  if (!res.ok) {
    mode = res.installed?.path ? 'open' : 'install';
    $('#mainActionBtn').textContent = res.installed?.path ? 'Повторить проверку' : 'Настроить ссылки / повторить';
    $('#mainActionBtn').disabled = false;
    $('#openBtn').disabled = !res.installed?.path;
    setStatus(res.title || 'Ошибка проверки', res.message || 'Не удалось проверить обновления.');
    setDetails(res.details || '');
    document.body.classList.add('error');
    return;
  }

  document.body.classList.remove('error');
  mode = res.mode;
  setStatus(res.title, res.message);
  setDetails(JSON.stringify({ installed: res.installed, manifest: res.manifest }, null, 2));

  if (mode === 'latest') {
    setProgress(100); setStep(3);
    $('#mainActionBtn').style.display = 'none';
    $('#openBtn').disabled = false;
    $('#openBtn').textContent = 'Открыть приложение';
  } else {
    $('#mainActionBtn').style.display = '';
    $('#mainActionBtn').disabled = false;
    $('#mainActionBtn').textContent = mode === 'update' ? 'Обновить приложение' : 'Установить приложение';
    $('#openBtn').disabled = !res.installed?.path;
    $('#openBtn').textContent = res.installed?.path ? 'Открыть старую версию' : 'Открыть приложение';
  }
}

async function installOrUpdate() {
  if (mode === 'open') return refreshState();
  $('#mainActionBtn').disabled = true;
  $('#openBtn').disabled = true;
  setProgress(0); setStep(1); setDetails('');
  setStatus(mode === 'update' ? 'Скачиваю обновление…' : 'Скачиваю приложение…', 'Не закрывай лаунчер до окончания загрузки.');

  const res = await window.ShieldLauncher.downloadInstall();
  if (!res.ok) {
    $('#mainActionBtn').disabled = false;
    setStatus(res.title || 'Ошибка загрузки', res.message || 'Не удалось скачать или открыть установщик.');
    setDetails(res.details || '');
    document.body.classList.add('error');
    return;
  }

  document.body.classList.remove('error');
  setProgress(100); setStep(2);
  setStatus('Установщик открыт', res.message || 'Заверши установку, потом нажми «Открыть приложение».');
  $('#mainActionBtn').textContent = 'Проверить ещё раз';
  $('#mainActionBtn').disabled = false;
  $('#openBtn').disabled = false;
}

async function openClient() {
  setStep(3);
  setStatus('Запускаю ShieldVPN Client…', 'Если приложение установлено, лаунчер закроется автоматически.');
  const res = await window.ShieldLauncher.openClient();
  if (!res.ok) {
    setStatus(res.title || 'Не удалось открыть клиент', res.message || 'Клиент не найден.');
    setDetails(res.details || '');
  }
}

function setProgress(v) {
  const p = Math.max(0, Math.min(100, Number(v) || 0));
  $('#progressBar').style.width = p + '%';
  $('.ring').style.setProperty('--p', p + '%');
  $('#percent').textContent = p + '%';
}
function setStep(index) { steps.forEach((s, i) => s.classList.toggle('active', i <= index)); }
function setStatus(title, text) { $('#statusTitle').textContent = title; $('#statusText').textContent = text; }
function setDetails(text) { $('#detailsText').textContent = text || ''; $('#detailsBox').open = Boolean(text && text.length < 400); }
function short(url) { return url.replace(/^https?:\/\//, '').slice(0, 68); }
