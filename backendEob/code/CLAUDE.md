# EobApp Backend (`backendEob/code`) — handbook for AI assistants

This document describes what the backend is, how it's wired together, and the conventions used for routes, sockets, the database, and Redis. It is meant to give an AI assistant or new contributor a complete mental model of this service so they can make changes without breaking the existing chess game flows.

The client repo (Expo / React Native) lives at the project root (one level above this folder). Top-level architecture is documented in `../../CLAUDE.md`.

---

## What this service does

The backend is the authoritative server for **EobApp** — a chess product wrapped in an arcade-style mobile/web shell. Responsibilities:

- **Account auth** — email + password login/registration, JWT issued in an `httpOnly` cookie named `token` (8-hour expiry; cookie `maxAge` 6h).
- **Guest sessions** — anonymous play backed by a UUID stored in cookie `id` and validated against Redis (`guest:<id>` key, 30-min TTL).
- **Online chess** — random-pair matchmaking on Redis sorted-set queues; full game lifecycle (moves, timers, draw offers, resignation, takeback, reconnect) via WebSockets.
- **Computer chess** — authenticated users can play vs the bundled Stockfish binary (`bin/stockfish`). Persisted as `ComputerGame` rows.
- **Stats & profile aggregation** — `/api/v1/user/profile` aggregates room/computer/guest games, computes wins/losses/draws and total play time.
- **Guest → user merge** — when a guest registers, all `GuestGames` rows tied to their `guestId` get linked to the new `User.id`.

---

## Tech stack

| Area | Tech |
|------|------|
| Runtime | Node.js (Dockerfile uses Node 22 Alpine), TypeScript ~5.9 |
| HTTP | Express 5 |
| Realtime | `ws` WebSocket server upgraded on the same HTTP server |
| Database | PostgreSQL via Prisma 7 (`@prisma/adapter-pg`, `pg`) — provider configured for Supabase Postgres |
| Cache / ephemeral state | Redis (Upstash, see `clients/redisClient.ts`) |
| Chess rules | `chess.js` |
| Auth | `jsonwebtoken`, `bcryptjs`, `cookie` / `cookie-parser` |
| Validation | `zod` (only for register/login/points payloads — most game payloads are validated by hand) |
| IDs | `nanoid` (room codes), `uuid` (guest ids) |
| Engine | `bin/stockfish` |

---

## Folder layout

```
backendEob/code/
├── bin/
│   └── stockfish                 # platform-specific engine binary
├── prisma/
│   ├── schema.prisma             # single source of truth for DB models
│   └── migrations/               # SQL migrations (currently only migration_lock.toml)
├── src/
│   ├── index.ts                  # HTTP server + WS upgrade router
│   ├── middleware.ts             # authMiddleware: verifies JWT cookie, sets req.userId
│   ├── seed.ts                   # Prisma seed entrypoint
│   ├── config/env.ts             # dotenv loader
│   ├── clients/
│   │   ├── prismaClient.ts       # PrismaClient with PrismaPg adapter
│   │   └── redisClient.ts        # Upstash Redis client (URL hardcoded in source)
│   ├── controllers/
│   │   ├── user-controller.ts    # /api/v1/user/* routes
│   │   └── game-controllers.ts   # /api/v1/game/* routes
│   ├── Classes/
│   │   ├── RoomManager.ts        # /room WS namespace (authenticated room games)
│   │   ├── GameManager.ts        # /guest WS namespace (anonymous matchmaking)
│   │   └── ComputerGameManager.ts# /computer WS namespace (vs engine)
│   ├── Services/
│   │   ├── GameServices.ts       # core game logic shared by managers
│   │   ├── RoomGameServices.ts   # room-game move/draw/leave/takeback handlers
│   │   ├── ComputerGameServices.ts# stockfish engine bridging + persistence
│   │   └── MatchMaking.ts        # Redis sorted-set queue insert/match/remove
│   └── utils/
│       ├── messages.ts           # WS event-name & error-name string constants
│       └── chessUtils.ts         # provideValidMoves, parseMoves/parseChat, addGuestGamesToUserProfile
├── Dockerfile                    # multi-stage prod build
├── package.json                  # see Scripts below
├── tsconfig.json                 # outputs to dist/
├── prisma.config.ts              # schema/migrations path config
├── .prettierrc / .prettierignore
└── .dockerignore / .gitignore
```

---

## HTTP routes

All routes are mounted under `/api/v1`. The two routers:

### `user-controller.ts` → `/api/v1/user`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/register` | none | Create user; payload validated by zod (`name`, `email`, `password`, `chessLevel`). On success: bcrypt-hash password, link guest games via `addGuestGamesToUserProfile`, drop guest from matchmaking queue, sign JWT, set `token` cookie, clear `guestId`. New users start with `points = 100` (DB default). |
| POST | `/login` | none | Email + password sign-in. Sets `token` cookie. Rejects social-login accounts (no `password` field). Drops guest from queue. |
| POST | `/logout` | `authMiddleware` | Clears `token` cookie. |
| GET | `/profile` | `authMiddleware` | Heavy aggregation: pulls user + all computerGames + createdRooms/joinedRooms + guestGamesAsP1/P2; computes win/loss/draw counts and total play time in `Hh Mm`. **Cached in Redis at `user:<id>:profile` for 30s** — invalidate via `redis.del(...)` after any mutation that affects what this returns. |
| POST | `/profile/update` | `authMiddleware` | Partial update of name/email/password/chessLevel. Invalidates profile cache. |
| GET | `/points` | `authMiddleware` | Returns current user's `points`. |
| POST | `/points` | `authMiddleware` | Body `{ delta: number }` — atomically increments points by `delta` (negative allowed). Invalidates profile cache. |
| GET | `/cookie` | none | Issue or refresh a guest UUID cookie + Redis `guest:<id>` (30 min TTL). |
| POST | `/checkAuth` | `authMiddleware` | Lightweight session check. |

### `game-controllers.ts` → `/api/v1/game`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/stats-total` | none | Global counters from Redis `stats` hash. |
| POST | `/computer/create` | `authMiddleware` | Start a new computer game. Rejects if user already has an active computer game (via `user:<id>:computer-game` Redis key). |
| PATCH | `/computer/finish` | `authMiddleware` | Calls `handlePlayerQuit` from `ComputerGameServices`. |

---

## WebSocket layer

`src/index.ts` creates a single `WebSocketServer({ noServer: true })` and routes upgrades by URL pathname:

| Path | Auth | Manager | Notes |
|------|------|---------|-------|
| `/room` | JWT cookie (`token`) | `roomManager.addRoomUser(userId, ws)` | Authenticated room/random matchmaking and gameplay |
| `/computer` | JWT cookie | `computerGameManager.addForComputerGame(userId, ws)` | Vs Stockfish |
| `/guest` | `?id=<guestId>` query + Redis `guest:<id>` exists | `gameManager.addUser(ws, guestId)` | Anonymous matchmaking + play |

Upgrade flow in `index.ts`:
1. Read `Cookie` header.
2. If `token` cookie present → `jwt.verify` with `SECRET_TOKEN` → attach `userId` to ws.
3. Else if `id` cookie present (guest) → upgrade without verifying JWT; pathname handler does Redis check.
4. Else 401.

⚠ `index.ts` has a stale fallback branch referring to `decodedToken` outside the JWT callback (dead code that the early `return`s skip). Do not rely on it; the live path is the JWT callback.

### WS event names

All event types live in `src/utils/messages.ts` as enums:
- `GameMessages` — shared (INIT_GAME, MOVE, OFFER_DRAW, ACCEPT_DRAW, REJECT_DRAW, RECONNECT, LEAVE_GAME, TIMER_UPDATE, TIME_EXCEEDED, ALREADY_IN_QUEUE, MATCH_NOT_FOUND, SEARCH_CANCELLED, CANCEL_SEARCH, DRAW_OFFERED, DRAW_REJECTED, DRAW_COOLDOWN, DISCONNECTED, GAME_NOT_FOUND, GAME_OVER, GAME_ACTIVE, CHECK, WRONG_PLAYER_MOVE)
- `RoomMessages` — room-specific (INIT_ROOM_GAME, ROOM_MOVE, ROOM_CHAT, ROOM_LEAVE_GAME, ROOM_RECONNECT, ROOM_TAKEBACK, ROOM_TIMER_UPDATE, ROOM_GAME_OVER, ROOM_GAME_ACTIVE, ROOM_DRAW, ROOM_TIME_EXCEEDED, ROOM_NOT_FOUND, ROOM_GAME_NOT_FOUND, ROOM_OPP_DISCONNECTED, ROOM_OPPONENT_LEFT, ROOM_LEFT, ASSIGN_ID_FOR_ROOM, WRONG_ROOM_MESSAGE, ILLEGAL_ROOM_MOVE, ROOM_RECONNECT)
- `ErrorMessages` — NO_AUTH, INVALID_AUTH, PAYLOAD_ERROR, SERVER_ERROR
- `ComputerGameMessages` — engine state strings

---

## Database (Prisma) models

Source of truth: `prisma/schema.prisma`. PostgreSQL provider; schema is pushed via `prisma db push` (the `migrations/` folder only contains the lockfile — there are no checked-in migration SQL files yet).

| Model | Purpose | Notable fields |
|-------|---------|----------------|
| `User` | Account holder | `id` (autoincrement), `name`, `email` (unique), `password?` (null for OAuth), `googleId?`, `chessLevel` enum, `points` (Int, default 100). Relations: gamesWon/Lost, createdRooms/joinedRooms, computerGames + won/lost, guestGamesAsP1/P2 |
| `Game` | Room game record | `currentFen`, `moves` (Json), `chat[]`, `whiteTimeLeft`/`blackTimeLeft`, `winnerId`/`loserId`, `draw`, `roomId` (unique), `type` (ROOM/RANDOM), `status` (ACTIVE/FINISHED), `endedAt`, `capturedPieces[]`, `lastMoveAt`/`lastMoveBy` |
| `ComputerGame` | Solo vs engine | `userId`, `computerDifficulty` (EASY/MEDIUM/HARD), `playerColor`, `currentFen`, `moves`, `capturedPieces[]`, `winnerId?`/`loserId?`, `draw`, `status` |
| `GuestGames` | Two anonymous players | `player1GuestId`/`player2GuestId` (always set), `player1UserId?`/`player2UserId?` (filled when a guest registers), `player1Color`, `player1TimeLeft`/`player2TimeLeft`, `player1DrawOfferCount`/`player2DrawOfferCount`, `winner` ('w'/'b'), `loser`, `draw`, `status` |
| `Room` | Lobby for room games | `code` (unique, nanoid), `createdById`, `joinedById?`, `status` (WAITING/FULL/ACTIVE/FINISHED/CANCELLED), 1:1 `Game` |

Enums: `ChessLevel` (BEGINNER/INTERMEDIATE/PRO), `RoomStatus`, `GameType`, `ComputerDifficulty`, `GameStatus` (ACTIVE/FINISHED).

---

## Redis key conventions

Ephemeral state and queues. Keys you'll see in this codebase:

| Key | Type | Purpose |
|-----|------|---------|
| `guest:<uuid>` | string (JSON) | Guest session metadata; 30-min TTL; existence is the auth check for `/guest` WS |
| `user:<userId>:game` | string | Active **guest** game id pointer (yes — uses `user:` prefix even for guest ids) |
| `user:<userId>:room-game` | string | Active **room** game id pointer (24h TTL) |
| `user:<userId>:computer-game` | string | Active computer game id pointer (24h TTL) |
| `user:<userId>:profile` | string | Cached profile JSON (30s TTL) — invalidate on mutations |
| `guest-game:<gameId>` | hash | Live guest-game state: whitePlayerId, blackPlayerId, fen, whiteTimer, blackTimer, status, etc. |
| `guest-game:<gameId>:moves` | list | Move history (push as JSON strings) |
| `guest-game:<gameId>:capturedPieces` | list | Captured piece codes like "wP", "bK" |
| `room-game:<gameId>` | hash | Live room-game state: user1, user2, fen, whiteTimer, blackTimer, status, moveCount, roomCode |
| `room-game:<gameId>:moves` | list | Move history |
| `room-game:<gameId>:chat` | list | Room chat history |
| `room-game:<gameId>:capturedPieces` | list | Captured piece codes |
| `room:<roomCode>:lobby-chat` | list | Pre-game lobby chat |
| `computer-game:<gameId>` | hash | Live computer-game state |
| `active-games` | set | Guest-game ids that the timer loop ticks |
| `room-active-games` | set | Room-game ids that the room timer loop ticks |
| `auth:matchmaking:queue:<5\|10>:<w\|b\|r>` | sorted set | Authenticated matchmaking queues (score = enqueue ms) |
| `guest:matchmaking:queue:<5\|10>:<w\|b\|r>` | sorted set | Guest matchmaking queues |
| `guest-games:disconnection:queue` | sorted set | Disconnect grace queue (score = ms; processed after 30s) |
| `draw-offer:<userId>` | string | Cooldown flag to rate-limit draw offers |
| `stats` | hash | Global counters: `roomGamesCount`, `guestGamesCount`, `guest:games:total` |

Two helper key builders to know:
- `getQueueKey(timeControl, color, isGuest)` in `Services/MatchMaking.ts` — owns the queue naming
- `parseMoves(redisKey)` / `parseChat(redisKey)` in `utils/chessUtils.ts` — reads a Redis list and parses each entry as JSON, with safe fallbacks

---

## Matchmaking flow

`Services/MatchMaking.ts` exports three functions used by both `RoomManager` and `GameManager`:

1. `insertPlayerInQueue(playerId, prefs)` — first scans **all 6** queues for the same player to prevent double-queueing, then `zAdd` to the chosen queue. Returns `false` if already in any queue.
2. `matchingPlayer(playerId, prefs)` — atomically `zPopMin`s opponents from compatible queues. Color-preference rules:
   - `w` looks at `b` then `r`
   - `b` looks at `w` then `r`
   - `r` looks at `r`, `w`, `b` (in that order)
   - If popped player == self, push back and try next queue
3. `removePlayerFromQueue(playerId, isGuest)` — sweep across all 6 queues (5/10 × w/b/r) with `zRem`.

Both managers also run a `checkQueueAndSendMessage()` interval that expires waiters after 60s with `MATCH_NOT_FOUND` and stops itself when all queues are empty.

---

## Timers

Both `GameManager` and `RoomManager` run a 1-second `setInterval` that:
- iterates the `active-games` / `room-active-games` set
- decrements whichever side's clock is to move (FEN turn byte)
- broadcasts `TIMER_UPDATE` / `ROOM_TIMER_UPDATE` to both players
- on hitting 0, calls `handleTimeExpired` / `handleRoomTimeExpired` which finalises the game in DB + Redis and emits `TIME_EXCEEDED` / `ROOM_GAME_OVER`

The timer self-terminates when its set is empty. Defensive guards in `handleRoomTimeExpired` skip when both clocks are >0 or when game status is no longer ACTIVE (prevents racing with resign/draw).

`MOVE_BEFORE_SAFE = 5` (in `utils/chessUtils.ts`) — every 5 moves, `saveGameProgress` writes the in-memory Redis state through to Postgres so a crash only loses ~5 plies. Reconnect/restore paths apply a 10-second forgiveness buffer (`TIME_BUFFER_ON_CRASH`) to both clocks.

---

## Authentication summary

- JWT signing key: `process.env.SECRET_TOKEN`
- Cookies: `token` (HTTP-only JWT) and `id` (guest UUID). On real registration/login, `id` is cleared and `token` is set.
- `authMiddleware` (`src/middleware.ts`) verifies the JWT and stamps `req.userId`.
- WS upgrade re-runs JWT verification independently from the HTTP middleware.
- For Postgres adapter (Prisma 7) the connection string is `DATABASE_URL`. The Redis URL is **hardcoded** in `clients/redisClient.ts` — replace with env var before prod hardening.

---

## Environment variables

| Var | Where used | Purpose |
|-----|------------|---------|
| `PORT` | `index.ts` | HTTP server port (default 3000) |
| `DATABASE_URL` | `clients/prismaClient.ts` | Postgres connection string |
| `SECRET_TOKEN` | `controllers/user-controller.ts`, `index.ts`, `middleware.ts` | JWT signing/verification |
| `CORS_ORIGINS` | `index.ts` | Comma-separated extra allowed origins (defaults already include `localhost:5173/8081/8082`) |
| `NODE_ENV` | `controllers/user-controller.ts` | Toggles cookie `secure` flag |
| `GUEST_MATCHING_KEY` | `utils/chessUtils.ts` | Optional override for the legacy guest queue key (current code uses the new `getQueueKey` builder) |

Loaded via `dotenv` in `src/config/env.ts` (imported transitively from `clients/prismaClient.ts` and `index.ts`).

---

## Scripts

From `package.json`:

| Command | Purpose |
|---------|---------|
| `npm run dev` | `tsc -b && node ./dist/index.js` — compile then run |
| `npm run build` | `tsc -b` |
| `npm run prisma:migrate` | `prisma migrate dev --schema ./prisma/schema.prisma` |
| `npm run prisma:generate` | `prisma generate --schema ./prisma/schema.prisma` |
| `npm run prisma:seed` | `prisma db seed --schema ./prisma/schema.prisma` (entry: `src/seed.ts`) |
| `npm run format` | Prettier across the package |

For **schema sync without creating a migration file**, `npx prisma db push --schema ./prisma/schema.prisma` from this directory is what's been used so far (the `migrations/` folder is empty aside from `migration_lock.toml`).

---

## Conventions when modifying this backend

1. **Don't break the WS contract.** All WS messages are `{ type, payload }`. Type strings live in `utils/messages.ts` — reuse them, don't inline literals.
2. **Mirror state to Redis first, Postgres second.** Live game state lives in Redis hashes/lists. Postgres is the durable store, written through every 5 moves and on game-end.
3. **Always invalidate `user:<id>:profile`** when you mutate anything that the profile aggregator returns. The cache is 30s but stale points/stats look broken to users.
4. **Do not regress the matchmaking queue keys.** Six queues per audience (5min × {w,b,r} + 10min × {w,b,r}) and `removePlayerFromQueue` must sweep all six on every disconnect/cancel.
5. **Guest game merging** runs in `register` via `addGuestGamesToUserProfile(guestId, newUserId)` — keep that call if you change the registration flow, otherwise guests lose their history on signup.
6. **Stockfish binary** at `bin/stockfish` is OS-specific. The Dockerfile builds for Linux; on Windows local dev the engine path may need swapping if you run computer games end-to-end.
7. **Cookies must stay httpOnly.** Mobile clients replay them via `getAuthCookie()` in the Expo app. Don't switch to Bearer auth without updating `api/authApi.ts` and `websockets/socketClient.ts` on the client.

---

*Last updated: 2026-05-06. Keep this file in sync when adding routes, models, Redis key prefixes, or WS event types.*
