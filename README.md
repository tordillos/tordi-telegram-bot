# tordi-telegram-bot

Bot de Telegram que agrega noticias de Tordillos (Salamanca) desde La Gaceta y Noticias a Tiempo. Corre en Cloudflare Workers con deploy automático desde GitHub.

## Requisitos previos

- Node.js 20+
- Cuenta de [Cloudflare](https://dash.cloudflare.com)
- Bot de Telegram creado con [@BotFather](https://t.me/BotFather)

## Configuración paso a paso

### 1. Crear el bot de Telegram

1. Habla con [@BotFather](https://t.me/BotFather) en Telegram
2. Envía `/newbot` y sigue las instrucciones
3. Guarda el **BOT_TOKEN** que te da

### 2. Configurar Cloudflare

1. Entra a [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Ve a **Workers & Pages** > **Overview**
3. Anota tu **Account ID** (aparece en la barra lateral derecha)

**Crear API Token:**

1. Ve a **My Profile** > **API Tokens** > **Create Token**
2. Usa la plantilla **Edit Cloudflare Workers**
3. Guarda el token generado (**CLOUDFLARE_API_TOKEN**)

**Crear KV Namespace:**

```bash
npx wrangler kv namespace create NEWS_KV
```

Copia el `id` que aparece en el output y guárdalo para configurarlo como GitHub Secret.

### 3. Obtener IDs de Telegram

**GROUP_CHAT_ID** (el grupo donde el bot enviará noticias):

1. Añade el bot al grupo de Telegram
2. Envía un mensaje en el grupo
3. Visita `https://api.telegram.org/bot<TU_BOT_TOKEN>/getUpdates`
4. Busca el campo `chat.id` del grupo (es un número negativo)

**SOURCE_CHANNEL_ID** (canal fuente para reenvío):

1. Reenvía un mensaje del canal a [@userinfobot](https://t.me/userinfobot)
2. El bot te dará el ID del canal

Guarda ambos valores para configurarlos como GitHub Secrets.

### 4. Configurar GitHub Secrets

En tu repositorio de GitHub, ve a **Settings** > **Secrets and variables** > **Actions** y añade estos secrets:

| Secret | Descripción |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token de API de Cloudflare (paso 2) |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID de Cloudflare (paso 2) |
| `BOT_TOKEN` | Token del bot de Telegram (paso 1) |
| `REPLACE_WITH_KV_NAMESPACE_ID` | ID del KV namespace (paso 2) |
| `GROUP_CHAT_ID` | ID del grupo de Telegram (paso 3) |
| `SOURCE_CHANNEL_ID` | ID del canal fuente (paso 3) |

### 5. Configurar el webhook del bot

Después del primer deploy, registra el webhook para que Telegram envíe mensajes al bot:

```bash
curl "https://api.telegram.org/bot<TU_BOT_TOKEN>/setWebhook?url=https://tordi-telegram-bot.<TU_SUBDOMAIN>.workers.dev"
```

## Comandos del bot

| Comando | Descripción |
|---|---|
| `/start` | Mensaje de bienvenida |
| `/status` | Comprueba que el bot funciona |
| `/tiempo` | Muestra el tiempo actual y la previsión del día en Tordillos |

El comando `/tiempo` usa la API de [Open-Meteo](https://open-meteo.com/) (gratuita, sin API key) para obtener:
- Temperatura actual y sensación térmica
- Humedad y viento
- Máximas y mínimas del día
- Probabilidad de lluvia (con aviso si supera el 40%)

Para que los usuarios vean los comandos en el menú de Telegram, configúralos en [@BotFather](https://t.me/BotFather) con `/setcommands`.

## Deploy

El deploy es automático: cada push a `main` dispara GitHub Actions que:

1. Instala dependencias
2. Verifica tipos con TypeScript
3. Inyecta los secrets en `wrangler.toml` (KV namespace, GROUP_CHAT_ID, SOURCE_CHANNEL_ID)
4. Deploya a Cloudflare Workers

También puedes deployar manualmente:

```bash
npm run deploy
```

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars  # Edita con tu BOT_TOKEN
npm run dev
```
