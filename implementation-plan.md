# The Dice Game — Technical Implementation Plan

> **Purpose:** This document is the engineering spec for building The Dice Game. It contains the full project structure, data models, algorithms, WebSocket protocol, and step-by-step build instructions. Work through the phases in order — each phase builds on the last and is independently testable.

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 18 + Vite | Fast HMR, simple config, no SSR needed |
| 3D Dice | Three.js | Lightweight, well-documented, good mobile WebGL perf |
| Styling | Tailwind CSS | Mobile-first utility classes, fast iteration |
| Backend | Node.js + Express | Serves both API and static frontend build |
| Real-time | Socket.IO | Auto-reconnect, room support built-in, fallback to polling |
| State | In-memory (Map) | No DB needed for v1; rooms are ephemeral |
| Language | TypeScript (shared types) | Shared interfaces between client and server prevent drift |

### Project Structure

```
dice-game/
├── package.json              # Workspace root
├── shared/
│   └── types.ts              # Shared TypeScript interfaces (Room, Player, GameEvent, etc.)
│   └── scoring.ts            # Pure scoring logic (used by both server and client for preview)
│   └── constants.ts          # Game constants (MAX_PLAYERS, PHASES, ROUNDS_PER_PHASE, etc.)
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts          # Express + Socket.IO bootstrap
│   │   ├── roomManager.ts    # Room CRUD, code generation, player join/leave
│   │   ├── gameEngine.ts     # Turn logic, phase/round advancement, scoring
│   │   ├── socketHandlers.ts # All Socket.IO event handlers
│   │   └── utils.ts          # Random, code gen, etc.
├── client/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx           # Top-level router (Home → Lobby → Game → Results)
│   │   ├── socket.ts         # Socket.IO client singleton
│   │   ├── store/
│   │   │   └── gameStore.ts  # Zustand store for all game state
│   │   ├── screens/
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── LobbyScreen.tsx
│   │   │   ├── GameScreen.tsx
│   │   │   └── ResultsScreen.tsx
│   │   ├── components/
│   │   │   ├── Dice3D.tsx        # Three.js die component
│   │   │   ├── Scoreboard.tsx    # Compact top scoreboard
│   │   │   ├── ScoreboardFull.tsx # Expanded per-phase breakdown
│   │   │   ├── Chat.tsx          # Twitch-style chat overlay
│   │   │   ├── GoOutButton.tsx   # Go-out with confirmation
│   │   │   ├── PhaseIndicator.tsx
│   │   │   ├── PlayerToast.tsx   # "Player X went out" notifications
│   │   │   └── TurnIndicator.tsx
│   │   ├── dice/
│   │   │   ├── DiceScene.ts      # Three.js scene setup, camera, lights
│   │   │   ├── DiceMesh.ts       # Geometry, materials, pip textures
│   │   │   └── DiceAnimator.ts   # Seeded deterministic roll animation
│   │   └── styles/
│   │       └── index.css         # Tailwind imports + custom dice glow, etc.
```

---

## Shared Types (shared/types.ts)

These are the core interfaces. Both server and client import from here.

```typescript
export interface Player {
  id: string;              // Socket.IO socket id
  displayName: string;
  color: string;           // Assigned on join (from a palette of 10)
  totalScore: number;      // Cumulative across all phases
  roundScore: number;      // Accumulating in current round
  phaseScores: number[];   // Length 4, score banked per phase
  isIn: boolean;           // Still in the current round
  isConnected: boolean;
  lastSeen: number;        // Timestamp for reconnect timeout
}

export interface Room {
  id: string;              // Internal UUID
  code: string;            // 6-char alphanumeric join code
  hostId: string;          // Socket ID of current host
  players: Player[];
  status: 'lobby' | 'active' | 'finished';
  phase: number;           // 1-4
  round: number;           // 1-10
  turnIndex: number;       // Index into turnOrder
  turnOrder: string[];     // Player IDs, shuffled per phase
  lastRoll: number | null;
  rollHistory: RollEvent[];
}

export interface RollEvent {
  phase: number;
  round: number;
  rollerId: string;
  result: number;
  timestamp: number;
  seed: number;            // For deterministic client animation
}

export interface ChatMessage {
  id: string;
  playerId: string;
  displayName: string;
  color: string;
  text: string;
  timestamp: number;
  type: 'message' | 'emoji';
}

// Socket.IO event payloads
export interface ServerEvents {
  room_state: (room: Room) => void;
  player_joined: (player: Player) => void;
  player_left: (playerId: string) => void;
  game_started: (room: Room) => void;
  roll_result: (event: RollEvent) => void;
  player_went_out: (data: { playerId: string; displayName: string; lockedScore: number }) => void;
  round_ended: (data: { reason: 'kill' | 'all_out'; scores: Record<string, number> }) => void;
  phase_ended: (data: { phase: number; scores: Record<string, number> }) => void;
  game_ended: (data: { finalScores: Record<string, number>; winnerId: string }) => void;
  chat_message: (msg: ChatMessage) => void;
  turn_changed: (data: { turnIndex: number; playerId: string }) => void;
  host_changed: (newHostId: string) => void;
  error: (msg: string) => void;
}

export interface ClientEvents {
  create_room: (displayName: string) => void;
  join_room: (data: { code: string; displayName: string }) => void;
  start_game: () => void;
  roll_dice: () => void;
  go_out: () => void;
  send_chat: (data: { text: string; type: 'message' | 'emoji' }) => void;
}
```

---

## Shared Scoring Logic (shared/scoring.ts)

This is the most important algorithm. It MUST live in shared code so the server is authoritative but the client can preview scores.

```typescript
import { KILL_NUMBER } from './constants';

/**
 * Calculate points for a single die roll in the given phase.
 * Returns 0 if the roll is the kill number (4).
 * Returns -1 as a sentinel for "round killed" so callers can distinguish
 * between a 0-point roll and a kill.
 *
 * Scoring is CUMULATIVE across phases:
 *   Phase 1: face value (except 4)
 *   Phase 2: 5 = 50, rest face value (except 4)
 *   Phase 3: 1 = 100, 5 = 50, rest face value (except 4)
 *   Phase 4: 2 = double current round score, plus all above
 */
export function scoreRoll(
  roll: number,
  phase: number,
  currentRoundScore: number
): { points: number; isKill: boolean; isDouble: boolean } {
  if (roll === KILL_NUMBER) {
    return { points: 0, isKill: true, isDouble: false };
  }

  // Phase 4: 2 doubles the entire current round score
  if (phase >= 4 && roll === 2) {
    return { points: currentRoundScore, isKill: false, isDouble: true };
    // Caller adds this to currentRoundScore, effectively doubling it
  }

  // Phase 3+: 1 = 100 points
  if (phase >= 3 && roll === 1) {
    return { points: 100, isKill: false, isDouble: false };
  }

  // Phase 2+: 5 = 50 points
  if (phase >= 2 && roll === 5) {
    return { points: 50, isKill: false, isDouble: false };
  }

  // Default: face value
  return { points: roll, isKill: false, isDouble: false };
}
```

### Scoring examples to validate against (use these as test cases):

| Phase | Roll sequence | Running score | Explanation |
|-------|--------------|---------------|-------------|
| 1 | 3, 6, 1 | 3 → 9 → 10 | All face value |
| 2 | 5, 3, 5 | 50 → 53 → 103 | 5s are worth 50 |
| 3 | 1, 5, 3 | 100 → 150 → 153 | 1=100, 5=50, 3=face |
| 4 | 3, 2, 2 | 3 → 6 → 12 | 3=face, 2 doubles 3→6, 2 doubles 6→12 |
| 4 | 1, 2, 5 | 100 → 200 → 250 | 1=100, 2 doubles to 200, 5=50 |
| Any | 5, 4 | 50 → KILLED (0) | 4 always kills |

---

## Game Constants (shared/constants.ts)

```typescript
export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;
export const NUM_PHASES = 4;
export const ROUNDS_PER_PHASE = 10;
export const KILL_NUMBER = 4;
export const ROOM_CODE_LENGTH = 6;
export const RECONNECT_TIMEOUT_MS = 60_000;
export const TURN_TIMEOUT_MS = 10_000;      // Auto-skip if disconnected player's turn
export const GO_OUT_WINDOW_MS = 3_000;       // Time after roll for go-out decisions
export const DICE_ANIMATION_MS = 2_000;      // How long the roll animation plays
export const PLAYER_COLORS = [
  '#4285F4', '#EA4335', '#FBBC04', '#34A853', '#FF6D01',
  '#46BDC6', '#7B1FA2', '#C2185B', '#00897B', '#5C6BC0'
];
```

---

## Build Phases

### PHASE 1: Game Engine + Tests (no UI, no sockets)

**Goal:** A fully working, tested game engine that can simulate an entire game in pure Node.

**Build these files:**
1. `shared/constants.ts`
2. `shared/scoring.ts`
3. `shared/types.ts`
4. `server/src/gameEngine.ts`
5. `server/src/roomManager.ts`
6. Tests for scoring and game engine

**gameEngine.ts core functions:**

```typescript
// Creates a new game state from a room in lobby status
function startGame(room: Room): Room

// Processes a dice roll for the current player
// - Generates random 1-6
// - Calculates score using shared scoring logic
// - If kill: ends round, zeroes out all "in" players' round scores
// - Returns updated room + the RollEvent
function processRoll(room: Room): { room: Room; event: RollEvent }

// Player goes out — locks in their round score
function processGoOut(room: Room, playerId: string): Room

// Advance to next turn (skip disconnected/out players)
function advanceTurn(room: Room): Room

// Check if round is over (all out, or kill)
function checkRoundEnd(room: Room): { ended: boolean; reason?: 'kill' | 'all_out' }

// Advance to next round, or next phase, or end game
function advanceRound(room: Room): { room: Room; phaseEnded: boolean; gameEnded: boolean }
```

**roomManager.ts core functions:**

```typescript
// In-memory store: Map<string, Room> keyed by room code
function createRoom(hostSocketId: string, hostName: string): Room
function joinRoom(code: string, socketId: string, displayName: string): Room | Error
function leaveRoom(code: string, socketId: string): Room | null
function getRoom(code: string): Room | undefined
function generateRoomCode(): string  // 6 chars, alphanumeric, no ambiguous chars (0/O, 1/I/L)
```

**Tests to write (Jest):**
- `scoring.test.ts` — all 6 example scenarios from the table above, plus edge cases
- `gameEngine.test.ts` — simulate a full 4-phase game programmatically, verify score accumulation, kill behavior, go-out locking, phase transitions, winner determination
- `roomManager.test.ts` — create, join, leave, full room rejection, code uniqueness

**Definition of done for Phase 1:** All tests pass. You can run a simulated game in a test file and get a correct winner.

---

### PHASE 2: WebSocket Layer

**Goal:** A running server that clients can connect to, create/join rooms, and play a full game via Socket.IO events.

**Build these files:**
1. `server/src/index.ts` — Express + Socket.IO setup, CORS, serves static files in prod
2. `server/src/socketHandlers.ts` — Maps Socket.IO events to gameEngine/roomManager calls

**socketHandlers.ts event map:**

```
Client sends          → Server does                           → Server emits
─────────────────────────────────────────────────────────────────────────────
create_room(name)     → roomManager.createRoom()              → room_state (to sender)
join_room(code,name)  → roomManager.joinRoom()                → room_state (to sender)
                                                              → player_joined (to room)
start_game()          → verify sender is host                 → game_started (to room)
                      → gameEngine.startGame()
roll_dice()           → verify it's sender's turn             → roll_result (to room)
                      → gameEngine.processRoll()
                      → if kill: wait DICE_ANIMATION_MS       → round_ended (to room)
                      →   then emit round_ended
                      → else: start GO_OUT_WINDOW timer       → turn_changed (to room)
                      →   then advanceTurn
go_out()              → gameEngine.processGoOut()              → player_went_out (to room)
                      → if all out: end round                 → round_ended (to room)
send_chat(msg)        → validate length ≤ 200 chars           → chat_message (to room)
disconnect            → mark player disconnected              → player_left (to room)
                      → start RECONNECT_TIMEOUT               → host_changed (if host)
                      → if in game & their turn: TURN_TIMEOUT
```

**Key server-side timing logic:**

After a non-kill roll, the server must:
1. Emit `roll_result` immediately
2. Wait `DICE_ANIMATION_MS` (2s) for animation to complete
3. Then wait `GO_OUT_WINDOW_MS` (3s) for go-out decisions
4. Then emit `turn_changed` and advance

Use `setTimeout` chains. Store timeout references on the room object so they can be cleared on early round-end.

**Test with a simple Node script or Postman/wscat** — connect two Socket.IO clients, create a room, join, start, and play a round by sending events manually.

**Definition of done for Phase 2:** Two socket clients can play a complete game via CLI/script.

---

### PHASE 3: React Frontend (2D placeholder dice)

**Goal:** A working mobile-first UI where real humans can play the game. Use a simple 2D animated square/number as a dice placeholder — do NOT build the 3D die yet.

**Screens to build in order:**

#### 3a. HomeScreen
- Two buttons: "Create Room" and "Join Room"
- Create: text input for display name → calls `create_room` → navigates to Lobby
- Join: text input for room code + display name → calls `join_room` → navigates to Lobby
- Mobile layout: centered card, large tap targets

#### 3b. LobbyScreen
- Shows room code prominently (tap to copy)
- Lists connected players with their assigned colors
- Host sees a "Start Game" button (disabled until 2+ players)
- Real-time: players appear/disappear as they join/leave

#### 3c. GameScreen (the main event)
- **Top bar:** Phase X / Round Y indicator, compact scoreboard (scrollable horizontal list of player name + score + in/out badge)
- **Center:** Dice area (large, ~50% viewport). For now: a big square that shows the number, with a CSS shake/spin animation on roll. Tap anywhere in this area to roll (only active on your turn).
- **Below dice:** "GO OUT" button (with confirmation: first tap shows "Tap again to confirm", second tap confirms). Turn indicator showing whose turn it is.
- **Bottom:** Chat overlay — scrolling messages, input field, emoji quick buttons
- **Toasts:** When someone goes out, animate a toast from the top

**State management (Zustand store):**

```typescript
interface GameStore {
  // Connection
  connected: boolean;
  playerId: string | null;

  // Room
  room: Room | null;
  chatMessages: ChatMessage[];

  // UI
  isRolling: boolean;       // Animation playing
  showGoOutConfirm: boolean;
  expandedScoreboard: boolean;

  // Actions
  createRoom: (name: string) => void;
  joinRoom: (code: string, name: string) => void;
  startGame: () => void;
  rollDice: () => void;
  goOut: () => void;
  sendChat: (text: string, type: 'message' | 'emoji') => void;
}
```

The store listens to all `ServerEvents` on the socket and updates state reactively. Components subscribe to slices.

**Mobile-first CSS breakpoints:**
- Default (mobile): single column, full-width, large touch targets
- `min-width: 768px` (tablet): slightly more padding, chat side panel option
- `min-width: 1024px` (desktop): max-width container, chat in sidebar

**Definition of done for Phase 3:** A group of people on their phones can play a full game end-to-end using the 2D placeholder die.

---

### PHASE 4: 3D Dice (Three.js)

**Goal:** Replace the placeholder die with a beautiful, realistic 3D die that all players watch roll simultaneously.

**Architecture:**

The die animation is purely cosmetic. The server determines the result. The client receives the result + a seed, and plays a deterministic animation that always lands on the correct face.

**DiceScene.ts — Three.js setup:**
```
- Renderer: WebGLRenderer with antialiasing, alpha (transparent background)
- Camera: PerspectiveCamera, positioned above and slightly in front of the die
- Lighting: one directional light (sun), one ambient light, one subtle point light below for bounce
- Ground plane: invisible but used for shadow (receive shadow = true)
- Responsive: resize handler tied to container div, not window
- Dispose: clean up on unmount to prevent WebGL context leaks
```

**DiceMesh.ts — The die itself:**
```
- BoxGeometry with beveled/rounded edges (use ExtrudeGeometry from a RoundedBoxGeometry or a custom chamfered shape)
- MeshStandardMaterial: white with slight roughness (0.3), subtle metalness (0.1)
- Pip textures: create programmatically on a Canvas2D, apply as texture maps per face
- Face mapping: standard Western die layout (opposite faces sum to 7)
  - Face index 0: 1 (opposite 6)
  - Face index 1: 6 (opposite 1)
  - Face index 2: 2 (opposite 5)
  - Face index 3: 5 (opposite 2)
  - Face index 4: 3 (opposite 4)
  - Face index 5: 4 (opposite 3)
- Cast shadow = true
```

**DiceAnimator.ts — Seeded deterministic animation:**

The animation must be deterministic given a seed so all clients show the same thing.

```typescript
function animateRoll(targetFace: number, seed: number, duration: number): Animation {
  // 1. Use a seeded PRNG (e.g., mulberry32) initialized with the seed
  // 2. Generate initial velocity: random spin on X, Y, Z axes (using seeded random)
  // 3. Generate 2-3 "bounce" keyframes at random positions (using seeded random)
  // 4. Final keyframe: die settles to the exact rotation that shows targetFace on top
  // 5. Use easeOutBounce or similar easing for the settle
  //
  // The animation itself uses requestAnimationFrame and interpolates between keyframes.
  // Total duration = DICE_ANIMATION_MS (2 seconds)
}

// Target rotations for each face (Euler angles that put face N on top):
const FACE_ROTATIONS: Record<number, { x: number; y: number; z: number }> = {
  1: { x: -Math.PI / 2, y: 0, z: 0 },
  2: { x: 0, y: 0, z: Math.PI / 2 },
  3: { x: 0, y: 0, z: 0 },
  4: { x: Math.PI, y: 0, z: 0 },
  5: { x: 0, y: 0, z: -Math.PI / 2 },
  6: { x: Math.PI / 2, y: 0, z: 0 },
};
```

**Dice3D.tsx — React wrapper:**
```typescript
// - useRef for the container div
// - useEffect to create DiceScene on mount, dispose on unmount
// - Expose an imperative `roll(targetFace, seed)` method via useImperativeHandle or a callback
// - Listen to isRolling state from store
// - On roll_result event: trigger animation
// - After animation completes: show result pulse (scale up briefly, glow)
// - On kill (4): red flash, screen shake CSS class
```

**Performance considerations:**
- Render only during animation (don't run rAF loop when idle)
- Use `powerPreference: 'high-performance'` on renderer
- Keep polygon count low (~1000 polys for the die)
- Test on older phones — target 60fps on iPhone 11 / Pixel 4 era

**Definition of done for Phase 4:** The 3D die looks great, animates smoothly on mobile, and every player in the room sees the same roll animation resolve to the same number.

---

### PHASE 5: Chat + Polish + Edge Cases

**Goal:** Complete the experience with chat, notifications, sound, and all edge case handling.

**5a. Twitch-Style Chat (Chat.tsx):**
- Scrolling message list, auto-scroll to bottom on new messages, pause auto-scroll if user has scrolled up
- Input field: max 200 chars, send on Enter
- Emoji quick-bar: 🔥 💀 👏 😭 (send as `type: 'emoji'`, render larger)
- Player names rendered in their assigned color
- Mobile: chat is a semi-transparent overlay at the bottom ~25% of screen
- Desktop: chat can be a sidebar panel

**5b. Sound effects:**
- Roll: rattling dice sound
- Score: subtle positive chime
- Kill (4): dramatic low thud / buzzer
- Go out: lock/click sound
- Someone else goes out: notification ping
- Phase end: fanfare sting
- Use Howler.js or the Web Audio API. All sounds mutable via a single toggle.

**5c. Haptic feedback:**
- On roll: `navigator.vibrate(100)` (short buzz)
- On kill: `navigator.vibrate([100, 50, 200])` (pattern)
- Check for API availability first

**5d. Edge case handling (implement all of these):**
- All players go out → round ends immediately, all keep their locked scores
- Only one player left in → they keep rolling alone
- Disconnected player's turn → 10s timeout, then auto-skip
- Host disconnects → transfer to next connected player, emit `host_changed`
- Reconnection → player rejoins with same name, server restores their state within 60s window
- Phase 4 double edge case → 2 doubles entire current round score (including previous doubles)
- Tie at game end → broken by highest single-round score

**5e. Visual polish:**
- Roll result confirmation: large number overlay that fades out
- Phase transition: full-screen overlay "Phase 2 — 5s are worth 50!" with 3s countdown
- Game end: confetti animation for winner, full scoreboard breakdown
- Player went out toast: slides in from top, shows name + score, auto-dismisses after 3s

**Definition of done for Phase 5:** A polished, fun game that handles all edge cases gracefully. Ready for real playtesting.

---

## Deployment Notes (for after development)

- **Build:** `cd client && npm run build` outputs to `client/dist/`
- **Server serves client:** In production, Express serves `client/dist/` as static files
- **Single port:** Both the HTTP server and WebSocket run on the same port
- **Deploy to:** Railway, Render, or Fly.io (all support WebSockets, free tier available)
- **Environment:** `PORT` env var, `NODE_ENV=production`
- **No database needed** for v1 — all state is in-memory and ephemeral

---

## Common Pitfalls to Avoid

1. **Don't simulate real physics on the client.** The animation is predetermined and cosmetic. The server picks the number.
2. **Don't use peer-to-peer.** All game logic runs through the server to prevent cheating.
3. **Don't forget to clean up Three.js on component unmount.** Dispose geometries, materials, textures, and the renderer. WebGL context leaks will crash mobile browsers.
4. **Don't block the go-out window.** Players need time after seeing a roll result to decide. The server enforces a timer — don't let the client skip it.
5. **Don't store room state in React state alone.** Use Zustand (or similar) with a single source of truth that updates from socket events. Components subscribe to slices.
6. **Don't forget the "between rounds" state.** After a round ends, there's a brief pause (2-3s) to show the result before the next round starts. Same for between phases (longer, ~5s with a phase transition screen).
7. **Watch out for Socket.IO room naming.** Use the room code as the Socket.IO room name, prefixed (e.g., `game:ABC123`) to avoid collisions with internal names.
8. **Mobile viewport issues.** Use `dvh` (dynamic viewport height) not `vh` to handle mobile browser chrome. Set `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">` to prevent zoom on double-tap.
