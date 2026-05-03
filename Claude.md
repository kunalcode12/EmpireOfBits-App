# EobApp — Project handbook for AI assistants

This document describes what **EobApp** is, how the repo is laid out, and what each major area of the codebase is responsible for. It is meant to orient tools and humans quickly when working in this monorepo-style workspace (Expo client + Node backend).

---

## What you are building

**EobApp** is a cross-platform **mobile/web chess experience** built with **Expo / React Native**, backed by a **Node.js + Express** API and **real-time WebSockets**. The product centers on:

- **Account-based play**: registration, login, JWT-in-cookie auth, profile-oriented data (chess level, stats).
- **Online chess**: room-based games, random matchmaking (queue), timers, move sync, draw offers, resign, chat (room), reconnect flows.
- **Guest play**: guests can play via Redis-backed sessions and WebSocket path `/guest` without a full account until they register (guest games can be merged into a new user).
- **Computer games**: authenticated users can play against the engine; backend bundles **Stockfish** (`backendEob/code/bin/stockfish`) and persists `ComputerGame` rows.
- **Shell for more games**: the Home tab lists arcade-style titles (mostly “Coming Soon”); **chess** is the main implemented gameplay loop today.
- **Product direction (UI copy)**: Home presents **Empire of Bits** as an interoperable arcade on **Solana** (devnet), with future “viewer influence” mechanics — separate from the chess backend, which is a traditional Node/Postgres/Redis stack.

Display name in Expo config: **EobApp** (`app.json`). Root npm package name: `eobapp`. Backend package name: `chessverse_backend`.

---

## Tech stack

### Mobile / web client (`/` repo root)

| Area | Technology |
|------|------------|
| Framework | **Expo SDK ~55**, **React 19**, **React Native 0.83** |
| Routing | **expo-router** (file-based routes, typed routes experiment) |
| State | **React Context** — `AuthContext`, `GameContext` |
| Networking | `fetch` to REST (`api/`), **WebSockets** (`websockets/`) |
| Storage | **expo-secure-store** + helpers in `utils/storageHelper.ts` (session cookie / user snapshot / active game id) |
| UI | React Native, **@expo/vector-icons**, **react-native-svg**, **expo-image**, **react-native-reanimated** |
| Tooling | TypeScript ~5.9, ESLint (`eslint.config.js`) |

### Backend (`backendEob/code/`)

| Area | Technology |
|------|------------|
| Runtime | **Node.js** (Dockerfile uses **Node 22** Alpine) |
| HTTP | **Express 5** |
| Real-time | **`ws`** WebSocket server upgraded on same HTTP server |
| Database | **PostgreSQL** via **Prisma 7** (`@prisma/adapter-pg`, `pg`) |
| Cache / ephemeral state | **Redis** (queues, guest keys, active game pointers) |
| Chess rules / validation | **chess.js** |
| Auth | **jsonwebtoken**, **bcryptjs**, **cookie** / **cookie-parser** |
| Validation | **zod** (e.g. registration payload) |
| IDs | **nanoid**, **uuid** |
| Engine | **Stockfish** binary in `bin/stockfish` |

### DevOps / config

- **Docker**: multi-stage `backendEob/code/Dockerfile` — install, `prisma generate`, `tsc` build, production image.
- **Prisma config**: `backendEob/code/prisma.config.ts` wires schema URL and migrations path.
- **Environment**: backend loads `.env` from CWD via `src/config/env.ts` (`dotenv`).

---

## Repository layout (top level)

```
EobApp/
├── app/                 # Expo Router screens & layouts
├── api/                 # REST client modules (auth, game)
├── assets/              # Static images (see below)
├── backendEob/code/     # Standalone TypeScript backend + Prisma
├── components/          # Shared RN chess / UI components
├── constants/           # Theme, piece SVG paths
├── hooks/               # Reusable hooks (chess, timer, matchmaking)
├── screens/             # Full-screen flows (auth, lobby, game, …)
├── scripts/             # Expo “reset project” utility script
├── store/               # React contexts (global app state)
├── utils/               # Pure helpers (FEN, moves, storage)
├── websockets/          # WS client + game event types / helpers
├── .vscode/             # Editor recommendations / settings
├── app.json             # Expo app config
├── package.json         # Client dependencies & scripts
├── tsconfig.json        # Client TS config
├── eslint.config.js     # Client lint
└── Claude.md            # This file
```

---

## Client: folders and files

### `app/` — routing (Expo Router)

| Path | Role |
|------|------|
| `_layout.tsx` | Root stack: `ThemeProvider` (dark), `AuthProvider`, `GameProvider`; stack routes `index`, `auth-flow`, `(tabs)`; splash/status integration. |
| `index.tsx` | Same auth/game phase gate as `auth-flow` (loading → `AuthScreen` or lobby / matchmaking / game / result). Included as a stack screen; the app’s default route is `(tabs)` (see `_layout.tsx`). |
| `auth-flow.tsx` | **Primary chess entry from the Home tab** — same phase-based gate; Home navigates here with `router.push('/auth-flow')`. |
| `(tabs)/_layout.tsx` | Bottom tabs: Home, Play, Wallet, Profile; `hideTabBar` targets segment names `game`, `lobby`, `matchmaking` (for future or moved routes — current tab folder only contains the four tab files below). |
| `(tabs)/index.tsx` | **Home** hub (“Empire of Bits” branding, game cards, Solana/devnet copy); **PLAY NOW** → `router.push('/auth-flow')` for auth and chess. |
| `(tabs)/play.tsx` | **Play** tab placeholder (“Coming Soon”). |
| `(tabs)/wallet.tsx` | **Wallet** tab placeholder (“Coming Soon”). |
| `(tabs)/profile.tsx` | **Profile** tab placeholder (“Coming Soon”). |

Chess UI (`LobbyScreen`, `GameScreen`, etc.) is rendered **inside** `auth-flow` (and similarly inside root `index` if ever used), not as separate `app/(tabs)/game.tsx` files in the current tree.

### `screens/`

| File | Role |
|------|------|
| `AuthScreen.tsx` | Sign-in / sign-up UI wired to `AuthContext` and `authApi`. |
| `LobbyScreen.tsx` | Pre-game hub: start matchmaking, room flows, etc. |
| `MatchmakingScreen.tsx` | Queue search UI while `game.phase === 'matchmaking'`. |
| `GameScreen.tsx` | Active board, timers, moves, draw/resign controls. |
| `ResultScreen.tsx` | Post-game summary after `phase === 'finished'`. |

### `store/`

| File | Role |
|------|------|
| `AuthContext.tsx` | User session: boot from storage, login/register/logout, errors; clears game socket on logout. |
| `GameContext.tsx` | Chess session state machine: socket status, FEN, timers, moves, draw/resign/chat, reconnect; bridges to `websockets/gameSocket`. |

### `api/`

| File | Role |
|------|------|
| `authApi.ts` | `API_BASE_URL` / `RESOLVED_API_BASE_URL` resolution (Expo extra, env, LAN host heuristics), sign-in/up, cookie-aware requests. |
| `gameApi.ts` | Authenticated REST: stats, resign, draw offer endpoints under `/api/v1/game`. |

### `websockets/`

| File | Role |
|------|------|
| `socketClient.ts` | Thin WS wrapper: connect with auth cookie header, reconnect, message/status subscribers; maps HTTP base URL to `ws`. |
| `gameSocket.ts` | Domain protocol: event name constants (`RoomSocketEvents`), typed payloads, helpers (`sendMove`, `joinQueue`, `reconnectRoomGame`, draw flow, etc.). |

### `components/`

| File | Role |
|------|------|
| `ChessBoard.tsx` | Renders squares, pieces, touch handling, highlights. |
| `ChessPiece.tsx` | Single piece rendering (SVG / styling). |
| `MoveHistory.tsx` | SAN / move list UI. |
| `Timer.tsx` | Countdown display for sides. |
| `DrawResignControls.tsx` | Draw offer / accept / reject and resign actions. |
| `LoadingSpinner.tsx` | Shared loading indicator. |
| `index.ts` | Barrel exports for components. |

### `hooks/`

| File | Role |
|------|------|
| `useChessGame.ts` | Board interaction / rules integration at the UI layer. |
| `useTimer.ts` | Client-side timer behavior aligned with server updates. |
| `useMatchmaking.ts` | Queue UX and socket commands for finding opponents. |
| `index.ts` | Barrel exports. |

### `utils/`

| File | Role |
|------|------|
| `chessHelpers.ts` | FEN parsing, move normalization, check detection, types (`ChessMove`, `Square`, …) — client-side chess helpers without importing `chess.js` in every screen. |
| `storageHelper.ts` | Secure persistence for auth cookie string, cached user profile fields, active game id helpers. |

### `constants/`

| File | Role |
|------|------|
| `theme.ts` | Colors, spacing, typography tokens for chess UI. |
| `pieceAssets.ts` | Maps piece types to SVG path data for rendering. |

### `assets/`

| Path | Role |
|------|------|
| `images/board.png` | Board or branding art. |
| `images/backimg.png` | Background image asset. |
| `images/loader-Photoroom.png` | Loader / splash-related art. |

**Note:** `app.json` references additional icon/splash paths (e.g. `./assets/images/icon.png`). Ensure those files exist for a clean Expo build; the tree listing above reflects what was present in the workspace snapshot used to author this doc.

### `scripts/`

| File | Role |
|------|------|
| `reset-project.js` | Official Expo template script: can move `app`, `components`, `hooks`, `constants`, `scripts` to `app-example` and scaffold a blank app. Safe to delete from `package.json` once unused. |

### Root client config files

| File | Role |
|------|------|
| `package.json` | Scripts: `expo start`, platform targets, `expo lint`. |
| `tsconfig.json` | TypeScript project options for the client. |
| `eslint.config.js` | Lint rules (Expo preset). |
| `README.md` | Default Expo starter readme (generic getting started). |
| `.gitignore` | Client ignore rules. |
| `.expo-start.*.log` | Local Expo CLI logs (if present); typically not committed. |

### `.vscode/`

| File | Role |
|------|------|
| `settings.json` | Workspace editor settings. |
| `extensions.json` | Recommended extensions. |

---

## Backend: `backendEob/code/`

### Entry & server

| Path | Role |
|------|------|
| `src/index.ts` | Creates Express app + HTTP server; mounts `/api/v1/user`, `/api/v1/game`; attaches **WebSocketServer**; handles `upgrade` with JWT cookie auth (or guest cookie path); routes WS by pathname: `/room`, `/computer`, `/guest`. |
| `src/config/env.ts` | Loads `.env` from process CWD. |
| `src/middleware.ts` | `authMiddleware` — verifies JWT from `token` cookie, sets `req.userId`. |

### HTTP controllers

| Path | Role |
|------|------|
| `src/controllers/user-controller.ts` | Register, login, logout, Google-related flows (see schema), guest cookie issuance, profile/update helpers, matchmaking queue removal on register, guest-game merge hooks. |
| `src/controllers/game-controllers.ts` | Game stats, computer game create/state/quit, guest-related REST, chess.js utilities where needed; composes Prisma + Redis. |

### Services (business logic)

| Path | Role |
|------|------|
| `src/Services/GameServices.ts` | Core game operations: persistence, timers, draw/resign, stats aggregation, cross-cutting game rules coordination (large module). |
| `src/Services/RoomGameServices.ts` | Room-scoped game lifecycle and sync. |
| `src/Services/MatchMaking.ts` | Random pairing queue in Redis, enqueue/dequeue, notifications. |
| `src/Services/ComputerGameServices.ts` | Computer games: state reads, player quit, engine integration points. |

### Realtime managers (classes)

| Path | Role |
|------|------|
| `src/Classes/RoomManager.ts` | Authenticated users in **room** WebSocket namespace; room join/leave, broadcasting. |
| `src/Classes/GameManager.ts` | **Guest** socket connections keyed by guest id; pairs with Redis guest validation in `index.ts`. |
| `src/Classes/ComputerGameManager.ts` | WS connections for `/computer`; ties users to active computer games. |

### Clients & data

| Path | Role |
|------|------|
| `src/clients/prismaClient.ts` | Shared Prisma client instance. |
| `src/clients/redisClient.ts` | Shared Redis client for ephemeral keys (queues, guest sessions, active game pointers). |

### Utilities & seed

| Path | Role |
|------|------|
| `src/utils/messages.ts` | String / enum-like constants for WS and API error/event typing. |
| `src/utils/chessUtils.ts` | Server-side chess helpers (e.g. guest game merge / FEN/move utilities). |
| `src/seed.ts` | Prisma seed script entry (referenced from `package.json` `prisma.seed`). |

### Prisma

| Path | Role |
|------|------|
| `prisma/schema.prisma` | Models: `User`, `Game`, `Room`, `ComputerGame`, `GuestGames`; enums for levels, room status, game type, difficulty, game status. |
| `prisma/migrations/*` | SQL migrations — each timestamped folder is one migration; `migration_lock.toml` locks provider. |

### Build & deploy artifacts

| Path | Role |
|------|------|
| `package.json` | Backend deps, `dev`/`build`, Prisma scripts. |
| `tsconfig.json` | Compiler options; build emits `dist/`. |
| `Dockerfile` | Production container build. |
| `.dockerignore` / `.gitignore` | Exclude patterns. |
| `.prettierrc` / `.prettierignore` | Formatting. |
| `pnpm-lock.yaml` / `package-lock.json` | Lockfiles (prefer one package manager in CI to avoid drift). |
| `bin/stockfish` | Engine binary used for computer play. |

---

## How client and backend connect

1. **REST** — Client calls `API_BASE_URL` / `RESOLVED_API_BASE_URL` (`api/authApi.ts`) for `/api/v1/user/*` and `/api/v1/game/*`.
2. **Cookies** — Auth uses HTTP-only-style flows from the server’s perspective; the client stores and replays the `Cookie` header via `getAuthCookie()` where needed, with `credentials: 'include'` on fetches.
3. **WebSockets** — `socketClient` connects to `ws://.../room`, `/computer`, or `/guest` paths matching `src/index.ts`. Guest uses query `?id=` and Redis validation.

**CORS** (from `index.ts`): allows `localhost:5173`, `8081`, `8082`, plus optional `CORS_ORIGINS` env list.

---

## Environment variables (conceptual)

Typical backend expectations (exact names live in code — search `process.env` in `backendEob/code/src`):

- `PORT` — HTTP port (default **3000**).
- `DATABASE_URL` — PostgreSQL connection string for Prisma.
- `SECRET_TOKEN` — JWT signing secret.
- Redis connection (see `redisClient.ts` for variable names).
- `CORS_ORIGINS` — optional comma-separated extra origins.

Client:

- `EXPO_PUBLIC_API_BASE_URL` or `API_BASE_URL` or Expo `extra.API_BASE_URL` for API/WS base resolution.

---

## Common scripts

| Where | Command | Purpose |
|-------|---------|---------|
| Client root | `npm install` / `npm start` | Install and run Expo dev server. |
| Client root | `npm run lint` | ESLint via Expo. |
| Backend | `npm run dev` | Compile (`tsc -b`) and run `dist/index.js`. |
| Backend | `npm run build` | Typecheck + emit `dist`. |
| Backend | `npm run prisma:migrate` / `prisma:generate` | DB schema workflow. |

---

## Maintenance notes for contributors

- **Two packages**: install dependencies in **both** the repo root and `backendEob/code` when doing full-stack work.
- **Prisma**: after pulling migrations, run `prisma generate` in the backend package.
- **Stockfish**: the bundled binary is OS-specific; the repo path suggests a Linux-oriented build — verify target deployment architecture or replace with a platform-appropriate engine build.
- **Logs**: `.expo-start.*.log` files are local noise; do not treat them as source of truth.

---

*Last updated from repository structure and key source files. Regenerate or amend this file when major modules or routes are added.*
