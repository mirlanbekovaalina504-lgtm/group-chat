/* Групповой чат: регистрация, JWT и WebSocket */

const API_BASE = 'https://inai-col3.fishrungames.com';
const API = {
  register: '/api/register/',
  login: '/api/login/',
  logout: '/api/logout/'
};
const WS_URL = 'wss://inai-col3.fishrungames.com/chat/';
const ACCESS_KEY = 'group_chat_access';

const $ = (id) => document.getElementById(id);

const authView = $('auth-view');
const chatView = $('chat-view');
const loginForm = $('login-form');
const registerForm = $('register-form');
const authError = $('auth-error');
const messagesEl = $('messages');
const messageForm = $('message-form');
const messageInput = $('message-input');
const sendBtn = $('send-btn');
const statusEl = $('status');
const statusText = $('status-text');
const meEl = $('me');

let accessToken = localStorage.getItem(ACCESS_KEY);
let myName = '';
let ws = null;
let authed = false;
let manualClose = false;
let reconnectTimer = null;
let reconnectCount = 0;

function showError(message) {
  authError.textContent = message;
  authError.hidden = false;
}
function clearError() {
  authError.textContent = '';
  authError.hidden = true;
}
function showAuth(message = '') {
  chatView.hidden = true;
  authView.hidden = false;
  if (message) showError(message);
  else clearError();
}
function showChat() {
  authView.hidden = true;
  chatView.hidden = false;
  meEl.textContent = myName;
}
function setBusy(form, busy) {
  form.querySelectorAll('button, input').forEach((el) => { el.disabled = busy; });
}
function setStatus(state, text) {
  statusEl.className = `status ${state}`;
  statusText.textContent = text;
}
function setComposerEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
}
function saveAccess(token) {
  accessToken = token;
  localStorage.setItem(ACCESS_KEY, token);
}
function clearSession() {
  accessToken = null;
  localStorage.removeItem(ACCESS_KEY);
}
function errorText(data, fallback) {
  if (typeof data === 'string' && data) return data;
  if (data && data.detail) return String(data.detail);
  if (data && data.message) return String(data.message);
  if (data && typeof data === 'object') {
    return Object.entries(data).map(([key, value]) =>
      `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`
    ).join('\n');
  }
  return fallback;
}

async function apiPost(path, body) {
  let response;
  try {
    response = await fetch(API_BASE + path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error('Не удалось связаться с сервером. Проверьте интернет.');
  }

  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; }
  catch { data = raw; }

  if (!response.ok) {
    const error = new Error(errorText(data, `Ошибка сервера (${response.status})`));
    error.status = response.status;
    throw error;
  }
  return data;
}

async function registerUser(username, password, email) {
  const body = { username, password };
  if (email) body.email = email;
  return apiPost(API.register, body);
}

async function loginUser(username, password) {
  const data = await apiPost(API.login, { username, password });
  if (!data || !data.access) {
    throw new Error('Ответ сервера не содержит access-токен.');
  }
  saveAccess(data.access);
  myName = data.user?.username || username;
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((item) => {
      item.classList.toggle('active', item === tab);
    });
    const loginSelected = tab.dataset.tab === 'login';
    loginForm.hidden = !loginSelected;
    registerForm.hidden = loginSelected;
    clearError();
  });
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const form = new FormData(loginForm);
  const username = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');

  if (!username || !password) {
    showError('Введите имя пользователя и пароль.');
    return;
  }

  setBusy(loginForm, true);
  try {
    await loginUser(username, password);
    loginForm.reset();
    beginChat();
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(loginForm, false);
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const form = new FormData(registerForm);
  const username = String(form.get('username') || '').trim();
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const repeat = String(form.get('password2') || '');

  if (!username || !password) {
    showError('Заполните имя пользователя и пароль.');
    return;
  }
  if (password !== repeat) {
    showError('Пароли не совпадают.');
    return;
  }

  setBusy(registerForm, true);
  try {
    await registerUser(username, password, email);
    await loginUser(username, password);
    registerForm.reset();
    beginChat();
  } catch (error) {
    if (error.status === 500) {
      showError('Сервер регистрации вернул ошибку 500. Это ошибка Backend; мы проверили этот же запрос через Swagger.');
    } else {
      showError(error.message);
    }
  } finally {
    setBusy(registerForm, false);
  }
});

function isNearBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
}
function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function addSystem(text) {
  const element = document.createElement('div');
  element.className = 'system';
  element.textContent = text;
  messagesEl.appendChild(element);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function addMessage({ sender, text, timestamp }) {
  const stick = isNearBottom();
  const element = document.createElement('div');
  element.className = `msg${sender === myName ? ' mine' : ''}`;

  const meta = document.createElement('div');
  meta.className = 'meta';
  const name = document.createElement('span');
  name.className = 'sender';
  name.textContent = sender || 'Пользователь';
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = formatTime(timestamp);
  meta.append(name, time);

  const body = document.createElement('div');
  body.className = 'text';
  body.textContent = text || '';
  element.append(meta, body);
  messagesEl.appendChild(element);

  if (stick) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function beginChat() {
  manualClose = false;
  reconnectCount = 0;
  messagesEl.innerHTML = '';
  showChat();
  connectWebSocket();
}

function connectWebSocket() {
  if (!accessToken || manualClose) return;
  clearTimeout(reconnectTimer);
  setComposerEnabled(false);
  setStatus('connecting', 'Подключение…');

  let socket;
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    setStatus('offline', 'Не удалось создать WebSocket');
    scheduleReconnect();
    return;
  }

  ws = socket;
  authed = false;

  socket.onopen = () => {
    if (socket !== ws) return;
    // Первое сообщение клиента по протоколу сервера — AUTH.
    socket.send(JSON.stringify({
      type: 'AUTH',
      payload: { token: accessToken }
    }));
  };

  socket.onmessage = (event) => {
    if (socket !== ws) return;
    let message;
    try { message = JSON.parse(event.data); }
    catch { return; }

    if (message.type === 'AUTH_SUCCESS') {
      authed = true;
      reconnectCount = 0;
      myName = message.payload?.username || myName;
      meEl.textContent = myName;
      setStatus('online', 'В сети');
      setComposerEnabled(true);
      if (!messagesEl.children.length) addSystem('Вы подключились к чату');
    } else if (message.type === 'NEW_MESSAGE' && message.payload) {
      addMessage(message.payload);
    }
  };

  socket.onerror = () => {
    // Состояние соединения обрабатывается в onclose.
  };

  socket.onclose = () => {
    if (socket !== ws || manualClose) return;
    authed = false;
    setComposerEnabled(false);
    setStatus('offline', 'Соединение закрыто');

    // В Swagger на присланных скриншотах refresh endpoint не указан.
    // Не вызываем несуществующий адрес: просим повторно войти.
    if (!accessToken) {
      showAuth('Токен отсутствует. Войдите снова.');
      return;
    }
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (manualClose) return;
  const delay = Math.min(1000 * (2 ** reconnectCount), 15000);
  reconnectCount += 1;
  setStatus('connecting', `Повторное подключение через ${Math.ceil(delay / 1000)} сек.`);
  reconnectTimer = setTimeout(connectWebSocket, delay);
}

function closeSocket() {
  manualClose = true;
  clearTimeout(reconnectTimer);
  if (ws) {
    const socket = ws;
    ws = null;
    try { socket.close(); } catch { /* уже закрыт */ }
  }
  authed = false;
  setComposerEnabled(false);
}

messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN || !authed) return;

  ws.send(JSON.stringify({
    type: 'CHAT_MESSAGE',
    payload: { text }
  }));
  messageInput.value = '';
  messageInput.focus();
});

$('logout-btn').addEventListener('click', async () => {
  const token = accessToken;
  closeSocket();

  // Logout API удаляет refresh HttpOnly cookie на сервере.
  try {
    await fetch(API_BASE + API.logout, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  } catch {
    // Даже при сетевой ошибке локальный выход выполняется.
  }

  clearSession();
  myName = '';
  messagesEl.innerHTML = '';
  showAuth();
});

if (accessToken) {
  beginChat();
} else {
  showAuth();
}
