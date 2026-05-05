# EobApp — Project handbook for AI assistants

This document describes what **EobApp** is, how the repo is laid out, and what each major area of the codebase is responsible for. It is meant to orient tools and humans quickly when working in this monorepo-style workspace (**Expo client** at repo root + **Node backend** under `backendEob/code/`).

For backend-only detail, see `backendEob/code/CLAUDE.md` if present.

---

## What you are building

**EobApp** is a cross-platform **mobile/web** app built with **Expo / React Native**. It combines:

- **Empire of Bits (product shell)**: Home and Play surfaces with arcade / retro UI, Solana devnet positioning in copy, and **Privy** for wallet-friendly identity (email, Google, external Solana wallets via SIWS, embedded Solana wallet).
- **Online chess (implemented gameplay)**: room games, random matchmaking, timers, move sync, draw/resign, room chat, reconnect — backed by the **Node + Postgres + Redis** API and WebSockets.
- **Legacy chess account**: `AuthContext` + `authApi` still implement **JWT-in-cookie** registration/login against the chess backend. After Privy login, `auth-flow` / `index` use `AuthBoundary` and only show chess lobby/game flows when this chess user exists (otherwise users see `AuthScreen` to link the backend account).
- **Guest chess**: guests can play via Redis-backed sessions and WebSocket path `/guest` (backend); can merge into a registered user.
- **Computer chess**: authenticated users vs engine; backend uses **Stockfish** (`backendEob/code/bin/stockfish`) and `ComputerGame` rows.
- **Arcade expansion**: Play tab is a **game library UI** (Chess, Tic-tac-toe tiles, locked classics); only chess is fully wired to live multiplayer today. Some tiles are visual-only until `onPress` / routing is hooked up.

Display name: **EobApp** (`app.json`). Root npm package: `eobapp`. Backend package: `chessverse_backend`.

---

## Tech stack

### Mobile / web client (`/` repo root)

| Area | Technology |
|------|------------|
| Framework | **Expo SDK ~55**, **React 19**, **React Native ~0.83** |
| Routing | **expo-router** (file-based routes; `experiments.typedRoutes` in `app.json`) |
| Identity / wallets | **@privy-io/expo**, **@privy-io/expo/ui**, **@privy-io/expo/connectors** (Phantom/Backpack deeplinks), **viem** (Privy UI peer) |
| On-chain (client) | **@solana/web3.js** (transfers, balance, QR), RPC from `constants/solana.ts` |
| State | **React Context** — `AuthContext` (chess JWT user), `GameContext` (chess session) |
| Networking | `fetch` → `api/` (REST), **WebSockets** → `websockets/` |
| Storage | **expo-secure-store** via `utils/storageHelper.ts` (auth cookie, cached user, active game id, cached Privy Solana address) |
| UI | **@expo/vector-icons**, **react-native-svg**, **expo-image**, **react-native-reanimated**, **expo-blur**, **react-native-qrcode-styled** |
| Tooling | TypeScript ~5.9, ESLint (`eslint.config.js`), **React Compiler** enabled in `app.json` |

**Bootstrap:** `package.json` `"main": "entrypoint.js"` loads text-encoding / randomness / Buffer / ethers shims, then `expo-router/entry`.

### Backend (`backendEob/code/`)

| Area | Technology |
|------|------------|
| Runtime | **Node.js** (Dockerfile often **Node 22** Alpine) |
| HTTP | **Express 5** |
| Real-time | **`ws`** on same HTTP server |
| Database | **PostgreSQL** + **Prisma 7** |
| Cache | **Redis** |
| Chess | **chess.js**, **Stockfish** binary |
| Auth | **JWT** cookie, **bcryptjs**, etc. |

### DevOps / config

- **Docker / Prisma / `.env`**: see backend folder and `backendEob/code/prisma.config.ts`.

---

## Repository layout (top level)

```
EobApp/
├── app/                    # Expo Router layouts & routes
├── api/                    # REST clients (chess backend)
├── assets/                 # Images, icons, splash
├── backendEob/code/        # Standalone backend (separate TS project)
├── components/             # Chess UI + shared components
├── constants/              # Theme, pieces, Privy, Solana RPC
├── hooks/                  # Chess, timers, matchmaking, Privy persistence
├── screens/                # Full-screen flows (chess, Privy, arcade)
├── scripts/                # reset-project helper
├── store/                  # AuthContext, GameContext
├── utils/                  # Chess helpers, storage, Privy user helpers
├── websockets/             # WS client + chess protocol
├── .vscode/
├── app.json
├── entrypoint.js           # Polyfills → expo-router entry
├── package.json
├── tsconfig.json           # Client TS; excludes backendEob/**
├── metro.config.js         # (if present) Metro tweaks
├── global-modules.d.ts     # Ambient types if needed
├── eslint.config.js
└── Claude.md               # This file
```

---

## Client: folders and files

### `app/` — routing (Expo Router)

| Path | Role |
|------|------|
| `_layout.tsx` | Wraps app in **PrivyProvider** + **PrivyElements** (accent, light/dark from system). **ThemeProvider** (dark navigation theme). **AuthProvider** + **GameProvider**. Root **Stack** initial route **`privy-auth`**, then `index`, `auth-flow`, `(tabs)`. Shows full-screen message if Privy app/client IDs are missing (`constants/privyConfig.ts`). Loads Inter font weights used in root. |
| `privy-auth.tsx` | Renders **`PrivyAuthScreen`** (Privy login: email OTP slide panel, Google, Phantom/Backpack SIWS, embedded wallet demos when logged in). |
| `index.tsx` | **AuthBoundary** → unauthenticated redirect to **`/privy-auth`**. If chess `AuthContext` user exists, phase gate: `MatchmakingScreen` / `GameScreen` / `ResultScreen` / `LobbyScreen`; else **`AuthScreen`**. |
| `auth-flow.tsx` | Same as `index.tsx` pattern; **Home** “PLAY NOW” navigates here (`router.push('/auth-flow')`) for chess after Privy. |
| `(tabs)/_layout.tsx` | **AuthBoundary** (loading spinner, unauthenticated → `/privy-auth`). Bottom tabs: Home, Play, Wallet, Profile. **`usePersistPrivySolanaAddress`**. Hides tab bar when route leaf is `game`, `lobby`, or `matchmaking` (reserved for future tab-nested chess routes). |
| `(tabs)/index.tsx` | **Home**: Empire of Bits hero, Press Start 2P font (remote TTF), **PrivyUserBanner**, CTA to **`/auth-flow`**, game cards / feature copy. |
| `(tabs)/play.tsx` | **`ArcadeCenterScreen`** — arcade hub with glitch rune background, reactive “viewer” onboarding panel (multi-step UI), game library grid (Chess / Tic-tac-toe / locked titles). |
| `(tabs)/wallet.tsx` | **`PrivyWalletScreen`** — embedded Solana address, balance, QR, fund (Privy UI), send SOL via web3.js, clipboard. |
| `(tabs)/profile.tsx` | Placeholder “PROFILE / Coming Soon” (pixel font). |

Chess UI screens live under `screens/` and are composed by `auth-flow` / `index`, not as `app/(tabs)/game.tsx`.

### `screens/`

| File | Role |
|------|------|
| `AuthScreen.tsx` | Chess backend sign-in / sign-up (`AuthContext`, `authApi`). |
| `LobbyScreen.tsx` | Pre-game hub (matchmaking, room, runic background). |
| `MatchmakingScreen.tsx` | Queue UI when `game.phase === 'matchmaking'`. |
| `GameScreen.tsx` | Live board, timers, moves, draw/resign. |
| `ResultScreen.tsx` | Post-game when `phase === 'finished'`. |
| `PrivyAuthScreen.tsx` | Privy authentication UI (email + OTP slide panel, Google, wallet picker modal, SIWS; signed-in: continue to app, logout, embedded wallet sign demos). |
| `PrivyWalletScreen.tsx` | Privy embedded wallet + Solana devnet tooling. |
| `ArcadeCenterScreen.tsx` | Play tab: CRT/glitch rune **ArcadeBackground**, **ArcadeHeader**, reactive toggle + **ReactivePanel** (email / OTP / Twitch steps — product UI), **GameCard** grid; Chess and Tic-tac-toe cards are shown unlocked but **may not yet define `onPress`** (navigation to chess can remain via Home → auth-flow). |

### `store/`

| File | Role |
|------|------|
| `AuthContext.tsx` | Chess JWT session: boot `checkAuth`, login/register/logout, `storageHelper`; clears game socket on logout. |
| `GameContext.tsx` | Chess state machine: socket, FEN, timers, moves, draw/resign/chat, reconnect; uses `websockets/gameSocket`. |

### `api/`

| File | Role |
|------|------|
| `authApi.ts` | `API_BASE_URL` resolution, sign-in/up, cookie-aware fetches. |
| `gameApi.ts` | Authenticated REST under `/api/v1/game`. |

### `websockets/`

| File | Role |
|------|------|
| `socketClient.ts` | WS connect with cookie, reconnect, subscribers. |
| `gameSocket.ts` | Chess protocol helpers and event names. |

### `components/`

| File | Role |
|------|------|
| `ChessBoard.tsx`, `ChessPiece.tsx`, `MoveHistory.tsx`, `Timer.tsx`, `DrawResignControls.tsx`, `LoadingSpinner.tsx` | Chess UI. |
| `PrivyUserBanner.tsx` | Home: shows Privy user email/name from `utils/privyUser`. |
| `index.ts` | Barrel exports. |

### `hooks/`

| File | Role |
|------|------|
| `useChessGame.ts` | Board interaction / rules at UI layer. |
| `useTimer.ts` | Timer display aligned with server. |
| `useMatchmaking.ts` | Matchmaking UX + socket commands. |
| `usePersistPrivySolanaAddress.ts` | Saves embedded Solana address to secure storage when Privy reports connected. |
| `index.ts` | Barrel exports. |

### `utils/`

| File | Role |
|------|------|
| `chessHelpers.ts` | Client chess helpers (no `chess.js` required everywhere). |
| `storageHelper.ts` | Secure storage: session cookie, user snapshot, game id, Privy Solana address helpers. |
| `privyUser.ts` | Derive display name / email from Privy `User` linked accounts. |

### `constants/`

| File | Role |
|------|------|
| `theme.ts` | Chess / app color tokens. |
| `pieceAssets.ts` | Piece SVG path data. |
| `privyConfig.ts` | `PRIVY_APP_ID`, `PRIVY_CLIENT_ID`, `privyConfigured` — prefer **env** (`EXPO_PUBLIC_PRIVY_*`) or `app.json` `extra` in production; avoid committing real secrets. |
| `solana.ts` | `SOLANA_RPC_URL` (default devnet public RPC; override with `EXPO_PUBLIC_SOLANA_RPC_URL` or `extra.solanaRpcUrl`). |

### `assets/`

Images referenced by `app.json` (icon, splash, adaptive icons, favicon). Ensure paths exist for release builds.

### `scripts/`

| File | Role |
|------|------|
| `reset-project.js` | Expo template reset utility. |

### Root client config

| File | Role |
|------|------|
| `package.json` | `main`: `entrypoint.js`; scripts: `expo start`, `android`, `ios`, `lint`. |
| `tsconfig.json` | Extends **`expo/tsconfig.base`**, `baseUrl`: `.`, path alias `@/*`, **`exclude`: `backendEob/**`** so the client IDE project does not typecheck the backend package. |
| `app.json` | Expo config, scheme `eobapp`, **plugins**: `expo-router`, `expo-splash-screen`, `expo-secure-store`, `expo-web-browser`, `expo-font`, `expo-image`; **experiments**: `typedRoutes`, `reactCompiler`. |
| `eslint.config.js` | ESLint (Expo preset). |

### `.vscode/`

Editor recommendations / settings.

---

## Backend: `backendEob/code/` (summary)

| Area | Notes |
|------|--------|
| Entry | Express + WS upgrade; routes `/api/v1/user`, `/api/v1/game`; WS paths `/room`, `/computer`, `/guest`. |
| Data | Prisma + PostgreSQL; Redis for queues / guests. |
| Chess | `chess.js`, Stockfish for computer games. |

Use **`npm run build`** / **`npm run dev`** inside `backendEob/code/`. After schema changes, run **`npm run prisma:generate`** there.

---

## How client pieces connect

1. **Privy** — Session for tabs and wallet features; configured in `app/_layout.tsx`. Unauthenticated users are sent to **`/privy-auth`**.
2. **Chess backend** — REST + WS using cookie from `authApi` / `socketClient`; driven by `AuthContext` + `GameContext` after the user completes **`AuthScreen`** (JWT user).
3. **Solana (client)** — Embedded wallet + optional transfers against `SOLANA_RPC_URL` (`PrivyWalletScreen`).

---

## Environment variables (conceptual)

**Client**

- `EXPO_PUBLIC_PRIVY_APP_ID`, `EXPO_PUBLIC_PRIVY_CLIENT_ID` (or `expo.extra` equivalents).
- `EXPO_PUBLIC_API_BASE_URL` / `API_BASE_URL` for chess REST + WS base resolution.
- `EXPO_PUBLIC_SOLANA_RPC_URL` (optional; defaults to public devnet in `constants/solana.ts`).

**Backend** — see `backendEob/code/src/config/env.ts` and `process.env` usage (`DATABASE_URL`, `SECRET_TOKEN`, Redis, `CORS_ORIGINS`, etc.).

---

## Common scripts

| Where | Command | Purpose |
|-------|---------|---------|
| Client root | `npm install` / `npm start` | Dev server |
| Client root | `npm run android` / `ios` | Platform targets |
| Client root | `npm run lint` | ESLint |
| Backend | `npm run dev` / `build` | Compile + run |
| Backend | `npm run prisma:generate` | Refresh Prisma Client |

---

## Maintenance notes

- **Two packages**: install deps at repo root **and** in `backendEob/code/` for full-stack work.
- **IDE TypeScript**: root `tsconfig.json` **excludes** `backendEob/**`; open backend files with **`backendEob/code/tsconfig.json`** or run `tsc -b` in the backend folder for accurate diagnostics.
- **Prisma**: after pulling migrations, `prisma generate` in the backend package.
- **Metro cache**: if bundler complains about cache deserialization, `npx expo start -c`.

---

*Last updated from the current client tree (excluding deep backend re-walk). Regenerate when major routes or auth flows change.*
