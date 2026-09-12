# RAG Chatbot

Учебный проект: RAG-чатбот на Spring Boot (java-service), FastAPI (python-service) и React/Vite (web) с векторной базой знаний на Postgres + pgvector.

## 1. Архитектура

```
┌────────────┐      /api/*      ┌──────────────┐   HTTP   ┌───────────────┐
│   web      │ ──────────────► │ java-service  │ ──────► │ python-service│
│ React/Vite │                 │ Spring Boot   │         │  FastAPI      │
│  :5173     │                 │    :8080      │         │    :8000      │
└────────────┘                 └──────┬───────┘         └───────┬───────┘
                                     │                          │
                                     │    JDBC                  │ REST
                                     ▼                          ▼
                              ┌──────────────┐         ┌──────────────┐
                              │  PostgreSQL   │         │   GitHub /   │
                              │  + pgvector   │         │  LLM API     │
                              │   :5432       │         │  (Gemini)    │
                              └──────────────┘         └──────────────┘
```

| Сервис | Стек | Порт | Роль |
|--------|------|------|------|
| `web` | React 18 + Vite 5 + react-markdown | 5173 | UI |
| `java-service` | Spring Boot 3.5 + Spring Security + JWT | 8080 | REST API, авторизация, ORM |
| `python-service` | FastAPI + OpenAI SDK | 8000 | эмбеддинги, LLM, RAG-пайплайн |
| `postgres` | pg16 + pgvector | 5432 | БД + векторный поиск |

## 2. Требования

| Инструмент | Версия | Как проверить |
|------------|--------|---------------|
| Docker + Docker Compose | V2 (плагин) | `docker compose version` |
| Node.js | ≥ 18 | `node -v` |
| Java | 21 (JDK) | `java -version` |
| Maven | 3.9+ | `mvn -v` |
| Python | 3.12 | `python3 --version` |
| SOPS | latest | `sops --version` (для работы с секретами) |

## 3. Быстрый старт (prod-like)

### 3.1. Установка SOPS и получение ключа

```bash
# Установить SOPS:
#   macOS:  brew install sops
#   Linux:  sudo apt install sops   (или из cargo: cargo install sops)
#   Windows: choco install sops

# Установить age:
#   macOS:  brew install age
#   Linux:  sudo apt install age
#   Windows: choco install age

# Сгенерировать ключ (один раз на команду):
mkdir -p .sops
sops-keygen age > .sops/age.key.txt          # приватный ключ — НЕ коммитить

# Публичный ключ уже записан в .sops.yaml (после шифрования .env.enc).
# На сервере (VPS) приватный ключ лежит в ~/.sops/age.key.txt и используется CI для расшифровки.

# Расшифровать секреты локально (получить .env):
sops -d --input-type dotenv --output-type dotenv .env.enc > .env
```

### 3.2. Запуск

```bash
# Расшифровать секреты → .env:
sops -d --input-type dotenv --output-type dotenv .env.enc > .env

docker compose up -d
```

Если SOPS ещё не настроен — запасной вариант: скопировать шаблон и заполнить вручную:

```bash
cp .env.example .env
# отредактировать .env реальными значениями
```

Обязательные переменные (валидируются через `${VAR:?}` в compose — compose откажется запускаться, если они пустые): `GITHUB_TOKEN`, `LLM_MODEL`, `EMBEDDING_MODEL`, `GITHUB_API_BASE_URL`. `APP_SECURITY_JWT_SECRET` имеет дефолтное значение — его нужно заменить свой (см. переменные окружения).

### 3.3. Демо-режим

Чтобы открыть интерфейс извне (на порту 80 сервера):

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d web
```

Закрыть (вернуть порт на loopback):

```bash
docker compose up -d web
```

Подробности см. [CICD.md](CICD.md#7-открыть-приложение-со-своего-компьютера).

## 4. Локальная разработка

Поднимает все сервисы из исходников с hot-reload. Использует `.env.dev` для переменных окружения.

```bash
# 1. Создать .env.dev (не коммитится, уже в .gitignore)
cp example-файлов .env.dev   # заполнить GITHUB_TOKEN и др.

# 2. Поднять dev-стек
docker compose -f docker-compose.dev.yml up
```

| Сервис | Что делает |
|--------|-----------|
| `java-service` | Собирается через Maven с volume-mount кода, Spring Boot DevTools перезагружает контекст. |
| `python-service` | uvicorn с `--reload`, код смонтирован. |
| `postgres` | Обычный pgvector, данные в volume `pg_data`. |
| `pgadmin` | pgAdmin 4 на порту 5050 для просмотра БД. |

### 4.1. Фронтенд отдельно

```bash
cd web
npm install
npm run dev          # Vite на http://localhost:5173
```

Vite проксирует `/api/*` → `http://localhost:8080`.

### 4.2. API документация

- java-service Swagger: `http://localhost:8080/swagger-ui.html`
- python-service OpenAPI: `http://localhost:8000/docs`

### 4.3. Проверка живости

```bash
curl -fsS http://localhost:8081/    # web (nginx в dev-режиме не используется, только фронт)
curl -fsS http://localhost:8080/v3/api-docs    # java-service
curl -fsS http://localhost:8000/health          # python-service
```

## 5. Переменные окружения

| Переменная | Обязательна | Описание |
|------------|-------------|----------|
| `POSTGRES_DB` | нет | Имя базы данных. Дефолт: `ragdb` |
| `POSTGRES_USER` | нет | Пользователь Postgres. Дефолт: `raguser` |
| `POSTGRES_PASSWORD` | нет | Пароль Postgres. Дефолт: `ragpass` |
| `GITHUB_TOKEN` | **да** | Токен GitHub Models API (используется и для chat, и fallback для embeddings) |
| `EMBEDDING_GITHUB_TOKEN` | нет | Отдельный токен для эмбеддингов. Если пусто — fallback на `GITHUB_TOKEN` |
| `LLM_MODEL` | **да** | Идентификатор модели LLM. Пример: `gemini-3.5-flash` |
| `EMBEDDING_MODEL` | **да** | Идентификатор модели эмбеддингов. Пример: `gemini-embedding-001` |
| `GITHUB_API_BASE_URL` | **да** | Базовый URL API GitHub Models |
| `APP_SECURITY_JWT_SECRET` | нет | Секрет для подписи JWT. **Обязательно заменить на собственный в проде**: `openssl rand -base64 48` |
| `APP_CORS_ALLOWED_ORIGINS` | нет | Список origin'ов для CORS, через запятую |
| `CHAT_MAX_HISTORY_MESSAGES` | нет | Лимит сообщений истории в LLM перед FIFO-обрезкой. Дефолт: `20` |

## 6. Шифрование секретов (SOPS)

Проект использует [Mozilla SOPS](https://github.com/getsops/sops) + age для хранения чувствительных переменных в зашифрованном виде в репозитории.

### Структура

| Файл | Что содержит | Git |
|------|-------------|-----|
| `.env.example` | Шаблон переменных (без значений) | ✅ коммитится |
| `.env` | Расшифрованные секреты (локально) | ❌ в `.gitignore` |
| `.env.enc` | Зашифрованный dotenv-файл со всеми переменными | ✅ коммитится |
| `.sops/age.key.txt` | Приватный ключ age | ❌ в `.gitignore` |

### Порядок работы

```bash
mkdir -p .sops
sops-keygen age > .sops/age.key.txt          # приватный ключ — НЕ коммитить
# Публичный ключ age уже записан в .sops.yaml

# Расшифровка (получить .env):
sops -d --input-type dotenv --output-type dotenv .env.enc > .env

# Редактирование секретов:
sops .env.enc                                # откроет $EDITOR, зашифрует на сохранение

# Шифрование in-place (если редактировали .env вручную):
sops -e --input-type dotenv --output-type dotenv .env.enc -i
```

### В CI (деплой на VPS)

В [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) секрет `SSH_PRIVATE_KEY` имеет дополнительную роль: приватный ключ age кладётся в `~/.sops/age.key.txt` на VPS, и при каждом деплое `.env.enc` автоматически расшифровывается:

```bash
# На VPS (выполняется скриптом деплоя):
export SOPS_AGE_KEY_FILE=$HOME/.sops/age.key.txt
sops -d --input-type dotenv --output-type dotenv .env.enc > .env
```

Это означает, что `.env` на сервере всегда актуален и не хранится в репозитории.

## 7. Деплой

Деплой автоматический: `git push` в `master` → GitHub Actions собирает образы → пушит в GHCR → по SSH деплоит на VPS.

```bash
git add -A && git commit -m "описание" && git push
```

Подробная документация — в [CICD.md](CICD.md).

**Как работает SOPS при деплое:** секрет `SSH_PRIVATE_KEY` в GitHub имеет двойное назначение — он используется и как SSH-ключ для подключения к VPS, и как контейнер для приватного ключа age. Скрипт деплоя кладёт его в `~/.sops/age.key.txt` на сервере, после чего автоматически расшифровывает `.env.enc` → `.env` перед `docker compose up`. Поэтому на VPS `.env` никогда не попадает в репозиторий.

Доступ к продакшену через SSH-тоннель:

```powershell
ssh -N -i "$env:USERPROFILE\.ssh\cwf_deploy" -p 22 -L 8081:127.0.0.1:8081 -L 8080:127.0.0.1:8080 deploy@ХОСТ
# → http://localhost:8081 (веб), http://localhost:8080/swagger-ui.html (API)
```

## 8. Публичный API

### 8.1. Аутентификация

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/register` | Регистрация `{username, password}` → `{token, user}` |
| POST | `/api/auth/login` | Вход `{username, password}` → `{token, user}` |

### 8.2. Чаты

Режим диалога (`PLAIN` или `RAG`) задаётся **при создании** и фиксирован на весь чат.

| Метод | Путь | Тело запроса | Ответ |
|-------|------|------------|-------|
| POST | `/api/conversations` | `{userId, mode: "PLAIN"/"RAG", title}` | `{id, userId, mode, title, createdAt}` |
| GET | `/api/conversations?userId={id}` | — | `[{id, userId, mode, title, createdAt}]` |
| GET | `/api/conversations/{id}` | — | `{id, userId, mode, title, createdAt}` |
| GET | `/api/conversations/{id}/messages` | — | `[{id, role, content, createdAt}]` |
| POST | `/api/conversations/{id}/messages` | `{content, mode}` | `{content, conversationId, usedRag, ...}` |

### 8.3. Эмбеддинги и база знаний

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/admin/embeddings/init` | Запустить векторизацию данных |

Полный список CRUD-эндпоинтов для базы знаний см. в Swagger: `http://localhost:8080/swagger-ui.html`.

### 8.4. Загрузка фронта при старте

1. При старте вызывается `GET /api/conversations?userId=1` для загрузки списка диалогов в sidebar.
2. `localStorage` проверяет `conversationId` — если есть, вызывается `GET /api/conversations/{id}` для получения реального `mode` и `GET /api/conversations/{id}/messages` для истории.
3. Если `conversationId` нет — отображается **экран выбора режима** (PLAIN/RAG).
4. При создании диалога запоминается `conversationId` + `conversationMode`, sidebar обновляется.

## 9. Структура репозитория

```
.
├── .sops/                        # Ключи SOPS (не коммитятся)
├── .sops.yaml                    # Правила шифрования SOPS
├── .github/workflows/deploy.yml  # CI/CD: деплой на VPS
├── CICD.md                       # Подробная документация деплоя
├── docker-compose.yml            # Production-стек
├── docker-compose.dev.yml        # Development-стек (с hot-reload + pgadmin)
├── docker-compose.demo.yml       # Overlay: открывает порт 80 для демо
├── .env.example                  # Шаблон переменных окружения
├── .env.enc                      # Зашифрованный dotenv (все переменные в одном файле)
│
├── web/                          # Фронтенд (React + Vite)
│   ├── src/
│   │   ├── api/                  # HTTP-клиенты (auth, chat, mock)
│   │   ├── pages/                # AuthPage, ChatPage
│   │   ├── components/           # MessageBubble, Sidebar
│   │   ├── App.jsx
│   │   └── styles.css
│   ├── vite.config.js            # Прокси /api → :8080
│   └── package.json
│
├── java-service/                 # Spring Boot бэкенд
│   ├── src/main/java/.../
│   │   ├── controller/           # REST-контроллеры
│   │   ├── service/              # Бизнес-логика
│   │   ├── repository/           # JPA-репозитории
│   │   ├── entity/               # JPA-сущности
│   │   ├── dto/                  # Data Transfer Objects
│   │   └── security/             # JWT, CORS
│   ├── src/main/resources/
│   │   ├── application.yml
│   │   └── db/changelog/         # Liquibase миграции
│   └── pom.xml                   # Maven: Spring Boot 3.5, Java 21
│
├── python-service/               # FastAPI сервис (LLM + эмбеддинги)
│   ├── app/
│   │   ├── routers/chat.py       # Эндпоинт чата
│   │   ├── routers/embed.py      # Эндпоинт эмбеддингов
│   │   ├── services/llm_client.py
│   │   └── schemas.py            # Pydantic-схемы
│   ├── requirements.txt          # fastapi, uvicorn, openai, pydantic
│   └── Dockerfile.dev
│
└── desktop/                      # Electron-обёртка (не контейнеризована)
```

## 9. Частые проблемы

### `GITHUB_TOKEN` не работает
- Проверить, что токен создан на https://github.com/settings/tokens и имеет scope для Models.
- В dev-режиме переменная берётся из `.env.dev` → `docker-compose.dev.yml` → `env_file`.

### Ошибка CORS при регистрации
- См. [CICD.md §3.4.1](CICD.md#341-сервис-web-особый-случай): nginx снимает заголовок `Origin`.
- При локальной разработке на порту 5173 Vite проксирует, CORS не участвует.

### JWT-токены перестали работать
- Сессия окончена, или `APP_SECURITY_JWT_SECRET` был изменён — старые токены аннулируются.

### `docker compose pull` падает на GHCR
- Образы публичные: проверить видимость пакетов в https://github.com/orgs/14shagov/packages.
