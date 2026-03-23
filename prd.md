

PRODUCT REQUIREMENTS DOCUMENT

**The Dice Game**

A Real-Time Multiplayer Web App

Version 1.0  |  March 2026  |  Draft

Mobile-First  ·  Real-Time Multiplayer  ·  3D Dice

# **1\. Overview**

The Dice Game is a real-time multiplayer web application where 2–10 players compete across four escalating phases of dice-based risk and reward. Players create or join private rooms using invite codes, roll a shared 3D die, and decide each round whether to bank their points or push their luck. The game is designed mobile-first with a desktop-compatible responsive layout.

The core experience centers on a single, beautifully rendered 3D die that all players watch simultaneously. The tension of communal risk—seeing others go out while you stay in—drives engagement and replayability.

# **2\. Goals & Success Metrics**

## **2.1 Product Goals**

* Deliver a frictionless join experience (under 10 seconds from code entry to gameplay)

* Create a visually compelling 3D dice experience that feels tactile on mobile devices

* Support real-time synchronization so all players see dice rolls at the same time

* Enable social interaction through in-game chat and visible player status changes

## **2.2 Success Metrics**

* Average session length greater than 15 minutes

* Room fill rate: average of 4+ players per room in first 30 days

* Latency: dice roll sync across all clients within 200ms

* Mobile usability score above 90 (Lighthouse)

# **3\. Game Rules & Mechanics**

## **3.1 Structure**

A full game consists of 4 phases, each containing 10 rounds. Players take turns rolling a single die. Turn order is randomized at the start of each phase. The player with the highest cumulative score after all 4 phases wins.

## **3.2 Round Flow**

1. A round begins. All players are “in” by default.

2. The current player taps the screen to roll the die. All players see the 3D die roll in real time.

3. If the result is a 4, the round ends immediately. All players still “in” lose their accumulated points for that round.

4. If the result is any other number, points are added to every in-player’s round score according to the current phase’s scoring rules.

5. Before the next roll, any player who is still “in” may choose to “go out” to lock in their round score. This is announced to all players.

6. Play continues with the next player’s turn until a 4 is rolled or all players have gone out.

## **3.3 Phase Scoring Rules**

Scoring rules are cumulative—each phase adds a new rule on top of the previous phase’s rules. A roll of 4 always ends the round with zero points for remaining players.

| Phase | Kill Number | Scoring | Design Intent |
| :---- | :---- | :---- | :---- |
| **Phase 1** | 4 ends round | 1–3, 5, 6 \= face value | Learn basic risk/reward |
| **Phase 2** | 4 ends round | 5 \= 50 pts; others face value | Higher reward for staying in |
| **Phase 3** | 4 ends round | 1 \= 100 pts; 5 \= 50 pts; others face value | Escalating stakes |
| **Phase 4** | 4 ends round | 2 \= doubles cumulative score; plus all prior rules | Maximum volatility |

## **3.4 Going Out**

At any point between rolls, a player may tap a “Go Out” button to lock in their cumulative round score. Once out, a player cannot re-enter the round. All other players receive a visible and audible notification that the player has gone out, along with the score they locked in. This creates social pressure and strategic information.

## **3.5 Winning**

After all 40 rounds (4 phases × 10 rounds), the player with the highest total score wins. Ties are broken by the highest single-round score achieved during the game.

# **4\. Rooms & Lobby System**

## **4.1 Room Creation**

* Any player can create a room, which generates a unique 6-character alphanumeric code.

* The room creator becomes the “host” with the ability to start the game once 2+ players have joined.

* Rooms support a maximum of 10 players.

* Players set a display name upon joining (no account required).

## **4.2 Joining a Room**

* Players enter the 6-character room code on the home screen to join.

* The lobby displays all connected players in real time with join/leave animations.

* If a room is full (10 players) or the game has already started, joining is blocked with a clear message.

## **4.3 Reconnection**

If a player disconnects mid-game, they have a 60-second window to reconnect using the same room code. Their score and position are preserved. After 60 seconds, they are removed and their remaining turns are skipped.

# **5\. Real-Time Features**

## **5.1 Synchronized Dice Roll**

The 3D die is the centerpiece of the experience. When a player rolls, the server determines the result and broadcasts it to all clients simultaneously. Every player sees the same animation resolve to the same number at the same moment. The roll animation should last approximately 1.5–2 seconds with realistic physics (bounce, spin, settle).

## **5.2 Twitch-Style Chat**

* A persistent chat overlay allows players to send short messages during the game.

* Messages appear in a scrolling feed at the bottom of the screen, styled like Twitch chat.

* Player names are color-coded to match their scoreboard color.

* Optional quick-reaction emoji buttons for common responses (fire, skull, clap, cry).

* Chat is visible but non-intrusive; it should never obscure the dice or critical game UI.

## **5.3 Player Status Alerts**

When a player goes out, a brief toast notification appears for all players showing the player’s name, their locked score, and a subtle animation. This serves both as information and social commentary—players can see who is playing it safe and who is gambling.

# **6\. UI/UX Design**

## **6.1 Mobile-First Layout**

The primary target is mobile browsers (iOS Safari, Android Chrome). The layout is a single vertical column optimized for one-handed portrait use. The desktop layout is a responsive adaptation, not a separate design.

**Screen hierarchy (top to bottom):** Phase/round indicator and mini-scoreboard at top; 3D dice area in the center (largest element, roughly 50% of viewport height); Go Out button and turn indicator below the dice; chat overlay pinned to the bottom.

## **6.2 3D Dice**

* Rendered using Three.js or Babylon.js with WebGL for performant 3D graphics.

* The die should have realistic materials: slightly rounded edges, subtle surface texture, clear pip markings.

* Physics-based animation: the die tumbles, bounces off invisible walls, and settles naturally.

* On mobile, the player taps anywhere on the dice area to roll. On desktop, a click or spacebar triggers the roll.

* The result number briefly enlarges or pulses after settling to confirm the outcome.

* A 4 triggers a distinct “danger” animation (red flash, shake) to reinforce the loss.

## **6.3 Scoreboard**

A compact scoreboard is always visible at the top of the screen showing each player’s name, total score, and status (in/out) for the current round. The active roller is highlighted. Players who have gone out are visually dimmed. Tapping the scoreboard expands it to a full detailed view with per-phase breakdowns.

## **6.4 Interaction Design**

* Tap to roll: large, forgiving tap target covering the entire dice area.

* Go Out button: prominent, always accessible, with a confirmation step to prevent accidental taps.

* Haptic feedback on roll (mobile devices that support it).

* Sound effects for roll, score, go-out, and round-end events (mutable).

# **7\. Technical Architecture**

## **7.1 Frontend**

* React or Next.js single-page application.

* Three.js for 3D dice rendering with a shared WebGL canvas.

* WebSocket client for real-time communication.

* Responsive CSS with mobile-first breakpoints (primary: 375px, tablet: 768px, desktop: 1024px).

* Progressive Web App (PWA) manifest for optional home-screen install.

## **7.2 Backend**

* Node.js server with WebSocket support (Socket.IO or native ws).

* Server-authoritative game logic: all dice results are determined server-side to prevent cheating.

* Room state held in-memory with optional Redis for horizontal scaling.

* RESTful API endpoints for room creation and joining; WebSocket for all in-game events.

## **7.3 Real-Time Sync Protocol**

1. Player taps to roll → client sends roll\_request event.

2. Server generates random result, timestamps it, broadcasts roll\_result to all clients.

3. All clients play the identical dice animation (seeded) and reveal the result simultaneously.

4. Server waits for a configurable post-roll window (3 seconds) for go-out decisions.

5. Server advances to the next turn or ends the round.

## **7.4 Data Model (Key Entities)**

* Room: id, code, host, players\[\], status (lobby/active/finished), current phase, current round.

* Player: id, displayName, totalScore, roundScore, isIn, isConnected.

* GameEvent: type, payload, timestamp (for replay and reconnection sync).

# **8\. Prioritization**

| Priority | Features |
| :---- | :---- |
| **P0 – Must Have** | Room creation/joining, dice rolling, phase scoring, turn system, mobile layout |
| **P1 – Should Have** | 3D dice animation, real-time sync, go-out mechanic, scoreboard |
| **P2 – Nice to Have** | Twitch-style chat, sound effects, haptic feedback, spectator mode |
| **P3 – Future** | Persistent accounts, leaderboards, custom rules, tournaments |

# **9\. Edge Cases & Rules Clarifications**

* All players go out before a 4 is rolled: the round ends immediately; everyone keeps their locked score.

* Only one player remains in: they continue rolling alone until they go out or a 4 is rolled.

* Player disconnects on their turn: after a 10-second timeout, the turn is auto-skipped.

* Host disconnects: host role transfers to the next connected player.

* Phase 4 doubling: rolling a 2 doubles the player’s entire cumulative round score at that moment, not just the face value.

* Multiple 2s in Phase 4: each 2 doubles the current cumulative round score again (exponential growth).

# **10\. Accessibility & Inclusivity**

* All critical game information is conveyed through both visual and auditory channels.

* Color is never the sole indicator of state; icons and labels are always present.

* Minimum touch target size of 44×44px on mobile.

* Screen reader announcements for dice results, turn changes, and player status updates.

* Reduced-motion mode that simplifies dice animation for vestibular sensitivity.

# **11\. Future Considerations**

* User accounts and persistent profiles with game history and statistics.

* Global leaderboards ranked by win rate and average score.

* Custom game modes: adjustable phase count, custom kill numbers, variable round counts.

* Tournament mode with bracket-style elimination across multiple games.

* Spectator mode allowing non-players to watch and chat without participating.

* Native mobile apps (iOS/Android) using React Native or a WebView wrapper.

# **12\. Open Questions**

1. Should there be a time limit per turn to keep the game pace up, or is social pressure sufficient?

2. Should chat support custom messages only, or also include a set of predefined taunts and reactions?

3. Should the game support a “quick play” mode with fewer rounds per phase for shorter sessions?

4. What is the maximum acceptable latency for dice sync before the experience degrades?

5. Should room codes be shareable via deep link (e.g., dicegame.app/join/ABC123)?