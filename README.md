# Групповой чат — HTML, CSS, JavaScript

## Файлы
- `index.html` — интерфейс
- `style.css` — стили
- `app.js` — регистрация, вход, JWT и WebSocket

## Запуск
Откройте папку в VS Code и запустите `index.html` через Live Server либо откройте файл в браузере.

## API, подтверждённые Swagger
- POST `/api/register/` — регистрация
- POST `/api/login/` — вход; ответ содержит `access` и `user`
- POST `/api/logout/` — выход; refresh хранится в HttpOnly Cookie

WebSocket: `wss://inai-col3.fishrungames.com/chat/`

## Важное ограничение
При проверке endpoint регистрации `/api/register/` непосредственно в Swagger сервер вернул HTTP 500. Поэтому никакой frontend-код не может гарантировать успешную регистрацию, пока Backend не исправлен. Вход Swagger проверялся с неверной парой логин/пароль и вернул HTTP 401; нужен существующий аккаунт с правильным паролем.

Refresh endpoint в предоставленных скриншотах Swagger не показан, поэтому автоматическое обновление access-токена здесь намеренно не реализовано. После истечения access-токена пользователю потребуется войти снова.
