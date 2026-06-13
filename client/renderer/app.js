const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  connected: false,
  trafficTimer: null
};

const theme = localStorage.getItem('shield-theme') || 'cyber';
document.body.dataset.theme = theme;

$('#minBtn').addEventListener('click', () => window.ShieldVPN.minimize());
$('#closeBtn').addEventListener('click', () => window.ShieldVPN.close());

$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.page').forEach(p => p.classList.remove('active'));
    $('#page-' + btn.dataset.page).classList.add('active');
  });
});

$$('.theme-card').forEach(btn => {
  btn.addEventListener('click', () => {
    document.body.dataset.theme = btn.dataset.theme;
    localStorage.setItem('shield-theme', btn.dataset.theme);
  });
});

$('#connectBtn').addEventListener('click', connect);
$('#disconnectBtn').addEventListener('click', disconnect);

window.ShieldVPN.onLog(line => appendLog(line));
window.ShieldVPN.onState(vpnState => {
  if (vpnState === 'connected') setConnected(true);
  if (vpnState === 'disconnected' || vpnState === 'error') setConnected(false);
  if (vpnState === 'connecting') setStatus('Подключение…', 'Поднимаю TUN-интерфейс и запускаю VPN-core.', 'CONNECTING');
  if (vpnState === 'disconnecting') setStatus('Отключение…', 'Останавливаю VPN-core.', 'STOPPING');
});

init();

async function init() {
  const engine = await window.ShieldVPN.engineStatus();
  $('#engineText').textContent = engine.ok ? 'VPN-core найден' : 'VPN-core не найден';
  appendLog(engine.message);
}

async function connect() {
  hideError();
  const key = $('#vpnKey').value.trim();
  setStatus('Подключение…', 'Проверяю ключ и запускаю real VPN-core.', 'CONNECTING');
  $('#connectBtn').disabled = true;

  const result = await window.ShieldVPN.connect(key);

  $('#connectBtn').disabled = false;
  if (!result.ok) {
    setConnected(false);
    showError(result.message);
    appendLog('ERROR: ' + result.message);
    return;
  }

  appendLog(`CONNECTED: ${result.protocol} · ${result.name}`);
  setConnected(true, result.name);
}

async function disconnect() {
  hideError();
  await window.ShieldVPN.disconnect();
  setConnected(false);
}

function setConnected(value, serverName = 'ShieldVPN Server') {
  state.connected = value;
  $('#statusChip').classList.toggle('connected', value);
  $('#orbButton').classList.toggle('connected', value);

  if (value) {
    setStatus('Подключено', `Трафик маршрутизируется через ${serverName}.`, 'ONLINE');
    startTraffic();
  } else {
    setStatus('Не подключено', 'Вставь VPN-ключ или subscription URL и нажми подключиться.', 'OFFLINE');
    stopTraffic();
  }
}

function setStatus(title, sub, chip) {
  $('#statusTitle').textContent = title;
  $('#statusSub').textContent = sub;
  $('#statusChip').textContent = chip;
}

function startTraffic() {
  stopTraffic();
  state.trafficTimer = setInterval(() => {
    $('#downSpeed').textContent = `${(120 + Math.random() * 680).toFixed(0)} Mb/s`;
    $('#upSpeed').textContent = `${(30 + Math.random() * 180).toFixed(0)} Mb/s`;
    $('#pingValue').textContent = `${(18 + Math.random() * 45).toFixed(0)} ms`;
  }, 850);
}

function stopTraffic() {
  if (state.trafficTimer) clearInterval(state.trafficTimer);
  state.trafficTimer = null;
  $('#downSpeed').textContent = '0 Mb/s';
  $('#upSpeed').textContent = '0 Mb/s';
  $('#pingValue').textContent = '— ms';
}

function appendLog(line) {
  const box = $('#logBox');
  const stamp = new Date().toLocaleTimeString();
  box.textContent += `\n[${stamp}] ${line}`;
  box.scrollTop = box.scrollHeight;
}

function showError(message) {
  const box = $('#errorBox');
  box.style.display = 'block';
  box.textContent = message;
}

function hideError() {
  $('#errorBox').style.display = 'none';
  $('#errorBox').textContent = '';
}
