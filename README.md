# Empire of Bits App

Where every game matters - an arcade-first mobile gateway into the Empire of Bits ecosystem.

Empire of Bits is an interoperable gaming ecosystem on Solana where games, player identity, points, wallets, livestream reactions, and future on-chain game history are designed to move together. The broader Empire of Bits project includes a web experience and a growing arcade library. This repository is the Expo mobile/web app: the player-facing arcade hub, wallet, profile, and chess experience.

The mobile app currently centers on two arcade cabinets:

- Chess: the fully playable live multiplayer game, with matchmaking, timers, ratings, points, chat, draw/resign flows, and reactive livestream sessions.
- Tic Tac Toe: an unlocked arcade cabinet in the mobile game library, ready for the same Empire of Bits shell and reactive treatment as the game catalog expands.

Locked cabinets such as Snake, Pong, and Tetris are already presented in the arcade UI as future games.

## Product Vision

Empire of Bits is built around the idea that arcade games should not feel isolated. A player's wallet, identity, stream presence, points, rewards, and achievements should carry across games instead of being trapped inside one title.

The core gameplay innovation is the Viewer-Influence Loop:

1. A player starts a game session.
2. The session is connected to a livestream, currently via Twitch and Vorld Reactive Arcade.
3. Viewers interact with the live match through boosts, drops, package events, countdowns, arena toggles, and other reactive events.
4. The mobile app displays those events in real time so chess becomes a livestream-native game instead of a closed two-player board.
5. The broader Solana/Anchor chess protocol provides the on-chain direction for verified game legality, wagers, events, and replayable game history.

The result is "Twitch Plays Chess meets arcade esports": a chess match that can be played normally, streamed reactively, and eventually verified through the same on-chain event model that powers the wider Empire of Bits stack.

## What Is Working In This App

### Arcade Home

The Home screen introduces Empire of Bits as a retro Solana arcade. It includes the product hero, animated runic/CRT styling, Privy user display, automatic backend account linking, and a direct route into gameplay.

New Privy users are registered or linked to the chess backend account system and receive the app's starting points balance from the backend.

### Play / Arcade Center

The Play tab is the main game library and points console.

- Shows the current points balance.
- Lets users refresh points from the backend.
- Supports buying points with SOL on Solana devnet.
- Supports selling points back through the backend payout flow.
- Shows Chess and Tic Tac Toe as active cabinets.
- Shows Snake, Pong, and Tetris as locked future cabinets.
- Allows Reactive Arcade setup by linking Vorld identity and a Twitch stream URL.
- Charges a 50 point entry cost before launching a chess match.

The Arcade Center is the bridge between "wallet app", "game launcher", and "streaming arcade dashboard".

### Chess Gameplay

Chess is the flagship game currently implemented in the mobile app.

Supported gameplay features:

- Random matchmaking over the backend WebSocket room service.
- 5 minute and 10 minute time controls.
- White, black, or random color preference.
- Player and opponent rating display.
- Live board state with legal move handling from the server.
- Realtime timers for both players.
- Move history and replay navigation.
- Check, checkmate, stalemate, draw, timeout, resignation, and disconnect handling.
- Room chat during the match.
- Draw offer, accept, reject, and resign controls.
- Result screen with rating movement and points outcome.
- Active game persistence and reconnect support.

The chess client is backed by the Node/Postgres/Redis chess service in `backendEob/code`, while the mobile app provides the arcade UI, board, timers, match state, and stream overlays.

### Reactive Chess Sessions

Reactive Chess is already wired into the app through Vorld Reactive Arcade.

Players can:

- Authenticate to Vorld with email OTP.
- Link a Twitch stream URL.
- Enable Reactive Arcade from the Play tab or Profile tab.
- Start a reactive chess session from the Game screen.
- Create a Vorld session using the chess game config.
- Connect to the live session WebSocket.
- Display session state, countdowns, arena toggles, boosts, item drops, and package events.
- Show in-game celebration overlays when viewers trigger boosts or drops.
- End the session from the Game or Result screen.

Reactive events currently handled by the app include:

- `session_started`
- `countdown`
- `arena_toggled`
- `boost_activated`
- `immediate_item_drop`
- `event_triggered`
- `session_ended`
- `package_unlocked`
- `overlay_changed`

This makes the mobile chess experience livestream-aware today. The app is not only a chessboard; it is the streamer's game console for reactive viewer participation.

### Solana Wallet

The Wallet tab is a devnet Solana vault powered by Privy embedded Solana wallets and `@solana/web3.js`.

Wallet features:

- Privy embedded Solana wallet creation.
- Cached wallet address persistence.
- Devnet SOL balance display.
- Pull-to-refresh balance updates.
- Copy address.
- Receive panel with QR code.
- Fund wallet through Privy UI.
- Send SOL by signing and broadcasting a transaction from the embedded wallet.
- Devnet RPC configuration through `EXPO_PUBLIC_SOLANA_RPC_URL`.

This wallet is the base for the Empire of Bits economy: points purchases, future wagers, future rewards, and future on-chain replay or achievement flows.

### Privy Identity

Privy is the primary identity layer for the app.

Supported auth surfaces:

- Email OTP login.
- Google OAuth login.
- External Solana wallet login through SIWS.
- Phantom deep link connector.
- Backpack deep link connector.
- Embedded Solana wallet provisioning.
- Message signing demos for wallet proof-of-control.

After Privy login, the app links the user into the chess backend account system so gameplay, ratings, points, and profile data can be stored server-side.

### Profile

The Profile tab gives players a consolidated identity and game account view.

It includes:

- Privy identity details.
- Backend user profile details.
- Points and game stats.
- Solana wallet actions.
- Profile updates.
- Reactive identity panel for Vorld/Twitch session setup.
- Buy/sell points surfaces.

The profile is designed to become the cross-game identity center for Empire of Bits.

## Reactive On-Chain Chess Protocol

Empire of Bits also includes a companion reactive multiplayer chess engine written in Rust with Anchor smart contracts for Solana games. That protocol is designed as infrastructure for on-chain, livestream-native chess.

The Anchor chess program is built around these ideas:

- Full on-chain chess legality, including move generation, king safety, castling, en passant, promotion, mate, stalemate, the 50 move rule, and insufficient-material draws.
- Game PDAs seeded by creator and session id, allowing multiple concurrent matches per creator.
- PDA-only account design for clean wallet-adapter and Solana Mobile Stack compatibility.
- Structured Anchor events for every state change: game creation, start, move, check, checkmate, stalemate, draw, clock update, stream reaction, and game end.
- Board hashes on move events so clients, overlays, bots, and indexers can verify replay state.
- Fischer clocks with public timeout flagging.
- Wager escrow with automatic payout on win, timeout, resignation, or draw split.
- Anti-replay nonces to prevent flaky network retries from applying a move twice.
- Compressed 16-bit move history for compact game account storage.
- Spectator reaction events for emotes, predictions, comments, and clip markers without bloating the core game account.

In the full Empire of Bits architecture, this Anchor protocol is the source-of-truth event layer for verified chess. Frontends, overlays, AI commentators, Discord/Twitch/YouTube bots, analytics systems, and replay tools can all consume the same event stream.

The current mobile app is the player and streamer surface for that direction: it already handles chess gameplay, Solana identity, wallet flows, Vorld reactive sessions, and realtime viewer-triggered event display. The on-chain protocol extends that product into verifiable Solana-native games.

## Vorld / Arena Arcade Integration

The app integrates with Vorld services for reactive livestream gameplay.

- `lib/vorldAuth.ts` handles Vorld email OTP auth and profile fetching.
- `lib/vorldTV.ts` creates and updates reactive sessions through `https://dev.reactive.thevorld.com`.
- `lib/websocket.ts` connects to the session WebSocket and subscribes to session events.
- `utils/reactiveStorageHelper.ts` persists reactive identity, stream URL, enabled state, and active session id.
- `screens/ArcadeCenterScreen.tsx`, `screens/GameScreen.tsx`, `screens/ResultScreen.tsx`, and `components/ReactiveIdentityPanel.tsx` expose the full reactive flow in the UI.

This is how Empire of Bits brings the Airdrop Arcade / Arena Arcade style viewer-influence loop into the mobile app.

## App Flow

```text
Privy Auth
  -> Home
  -> Arcade Center
     -> Enable Reactive Arcade with Vorld + Twitch
     -> Buy or refresh points
     -> Launch Chess
        -> Pay 50 point entry
        -> Matchmaking
        -> Live Chess Game
           -> Optional Reactive Session
           -> Viewer boosts / drops / package events
        -> Result
           -> Rating + points update
           -> End reactive session

Wallet
  -> Create embedded Solana wallet
  -> View balance
  -> Receive / fund / send devnet SOL

Profile
  -> Account, points, stats, Solana identity, reactive identity
```

## Tech Stack

### Mobile / Web App

- Expo SDK 55
- React 19
- React Native 0.83
- Expo Router
- TypeScript
- Privy Expo SDK
- Privy embedded Solana wallets
- `@solana/web3.js`
- Secure storage through `expo-secure-store`
- WebSockets for chess
- Socket.IO client for reactive Vorld sessions
- React Context for auth, game, and points state

### Chess Backend

The backend lives in `backendEob/code`.

- Node.js
- Express
- `ws` WebSocket server
- PostgreSQL with Prisma
- Redis for queues and active game state
- JWT cookie auth
- `chess.js`
- Stockfish binary for computer chess

### Wider On-Chain Stack

The broader Empire of Bits chess infrastructure includes:

- Rust
- Anchor Framework
- Solana PDAs
- Anchor event streams
- On-chain chess legality
- Wager escrow
- Stream reaction events
- Overlay, bot, commentator, and analytics subscribers

## Repository Layout

```text
EobApp/
|-- app/                    # Expo Router routes and tab layout
|-- api/                    # REST clients for backend auth, points, profile, game APIs
|-- assets/                 # App images, icons, splash assets
|-- backendEob/code/        # Node/Postgres/Redis chess backend
|-- components/             # Chess board UI, controls, reactive identity panel
|-- constants/              # Theme, Privy config, Solana RPC config, piece assets
|-- hooks/                  # Chess interaction, timers, matchmaking, wallet persistence
|-- lib/                    # Vorld auth, Vorld TV API, reactive websocket client
|-- screens/                # Product screens: auth, home, arcade, chess, wallet, profile
|-- store/                  # AuthContext, GameContext, PointsContext
|-- utils/                  # Chess helpers, storage helpers, Privy/reactive user helpers
|-- websockets/             # Chess WebSocket client and room protocol
|-- app.json                # Expo app config
|-- entrypoint.js           # Polyfills, shims, and expo-router entry
`-- package.json            # App scripts and dependencies
```

## Key Screens

- `screens/PrivyAuthScreen.tsx`: Empire of Bits auth gateway with email, Google, external wallets, embedded wallet, and signing demos.
- `screens/HomeScreen.tsx`: product hero, user sync, and entry point into the arcade.
- `screens/ArcadeCenterScreen.tsx`: points, buy/sell, reactive setup, game library, chess entry flow.
- `screens/LobbyScreen.tsx`: time control, color selection, rating, random matchmaking, reactive status banner.
- `screens/MatchmakingScreen.tsx`: waiting state while the backend pairs players.
- `screens/GameScreen.tsx`: chessboard, timers, moves, chat, draw/resign controls, reactive session control, live viewer events.
- `screens/ResultScreen.tsx`: win/loss/draw summary, rating update, points update, reactive session cleanup.
- `screens/PrivyWalletScreen.tsx`: embedded Solana wallet, balance, receive QR, fund, send.
- `screens/ProfileScreen.tsx`: profile, points, Solana account, game stats, Vorld reactive identity.

## Getting Started

Install app dependencies:

```bash
npm install
```

Start the Expo app:

```bash
npm start
```

Run on a target:

```bash
npm run android
npm run ios
npm run web
```

Run lint:

```bash
npm run lint
```

## Environment

Recommended app configuration:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
EXPO_PUBLIC_WEBSOCKET_URL=<vorld-session-websocket-url>
EXPO_PUBLIC_PRIVY_APP_ID=<privy-app-id>
EXPO_PUBLIC_PRIVY_CLIENT_ID=<privy-mobile-client-id>
```

Notes:

- The chess backend defaults to localhost or the Expo host when `EXPO_PUBLIC_API_BASE_URL` is not set.
- Android emulators use `10.0.2.2:3000` for local backend fallback.
- The Solana wallet defaults to public devnet RPC.
- Vorld auth currently points at `https://auth.thevorld.com`.
- Vorld reactive sessions currently point at `https://dev.reactive.thevorld.com`.

## Running The Backend

From the backend package:

```bash
cd backendEob/code
npm install
npm run prisma:generate
npm run build
npm run dev
```

The backend requires PostgreSQL, Redis, and the backend environment variables such as `DATABASE_URL`, `SECRET_TOKEN`, `PORT`, and CORS configuration.

## Product Status

Implemented in this app:

- Privy auth and embedded Solana wallet.
- Home, Play, Wallet, and Profile tabs.
- Points balance and points trading UI.
- Live chess matchmaking and gameplay.
- Chess ratings, timers, chat, draw/resign, reconnect, result flow.
- Reactive Arcade setup with Vorld OTP and Twitch URL.
- Reactive chess session creation, realtime events, and session cleanup.
- Tic Tac Toe cabinet in the mobile arcade library.
- Future locked game cabinets.

Part of the broader Empire of Bits roadmap:

- Full Tic Tac Toe gameplay wiring.
- Additional arcade games such as Snake, Pong, Tetris, Space Invader, Axe Arcade, Candy Crush, and Battleship.
- Deeper Airdrop Arcade package effects inside each game.
- Solana/Anchor chess program integration as the verified source of truth for on-chain games.
- Wagers, replay NFTs, achievements, tournaments, and cross-game asset utility.
- AI commentator, overlays, bots, and analytics subscribers consuming the same event stream.

## Contact

Empire of Bits is built as a Solana-native arcade ecosystem for players, streamers, and viewers.

- Email: empireofbits@gmail.com
- Twitter: `@empireofbits`
