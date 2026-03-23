import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  DICE_ANIMATION_MS,
  GO_OUT_WINDOW_MS,
  KILL_NUMBER,
  MIN_PLAYERS,
  RECONNECT_TIMEOUT_MS,
  TURN_TIMEOUT_MS,
} from '@shared/constants';
import { ChatMessage, Room } from '@shared/types';
import {
  advanceTurn,
  advanceRound,
  checkRoundEnd,
  getWinner,
  processGoOut,
  processRoll,
  startGame,
} from './gameEngine';
import {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  setRoom,
  updatePlayerConnection,
} from './roomManager';

// ── per-socket lookup ──────────────────────────────────────────────────────
const playerRoom = new Map<string, string>(); // socketId → roomCode

// ── per-room timer state ───────────────────────────────────────────────────
interface RoomTimers {
  goOutTimer: ReturnType<typeof setTimeout> | null;
  turnTimeout: ReturnType<typeof setTimeout> | null;
  reconnectTimeouts: Map<string, ReturnType<typeof setTimeout>>;
}

const roomTimers = new Map<string, RoomTimers>();

function getOrCreateTimers(code: string): RoomTimers {
  if (!roomTimers.has(code)) {
    roomTimers.set(code, {
      goOutTimer: null,
      turnTimeout: null,
      reconnectTimeouts: new Map(),
    });
  }
  return roomTimers.get(code)!;
}

// ── helpers ────────────────────────────────────────────────────────────────

/** playerId → roundScore snapshot (taken BEFORE advanceRound wipes them) */
function buildScores(room: Room): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const p of room.players) {
    scores[p.id] = p.roundScore;
  }
  return scores;
}

function emitTurnChanged(io: Server, code: string, room: Room): void {
  const playerId = room.turnOrder[room.turnIndex];
  io.to('game:' + code).emit('turn_changed', {
    turnIndex: room.turnIndex,
    playerId,
  });
}

function emitGameEnded(io: Server, code: string): void {
  const room = getRoom(code);
  if (!room) return;
  const { winnerId, finalScores } = getWinner(room);
  io.to('game:' + code).emit('game_ended', { finalScores, winnerId });
}

function emitPhaseEnded(
  io: Server,
  code: string,
  completedPhase: number,
  nextRoom: Room
): void {
  const phaseScores: Record<string, number> = {};
  for (const p of nextRoom.players) {
    phaseScores[p.id] = p.phaseScores[completedPhase - 1];
  }
  io.to('game:' + code).emit('phase_ended', {
    phase: completedPhase,
    scores: phaseScores,
  });
}

/**
 * Called when a round is definitively over (kill or all_out).
 * Snapshots scores, calls advanceRound, then emits appropriate events.
 */
function endRound(
  io: Server,
  code: string,
  room: Room,
  reason: 'kill' | 'all_out'
): void {
  const scores = buildScores(room);
  const completedPhase = room.phase;

  const { room: next, phaseEnded, gameEnded } = advanceRound(room);
  setRoom(next);

  io.to('game:' + code).emit('round_ended', { reason, scores });

  if (gameEnded) {
    emitGameEnded(io, code);
  } else if (phaseEnded) {
    emitPhaseEnded(io, code, completedPhase, next);
    // Brief pause before starting next phase turn
    setTimeout(() => {
      const fresh = getRoom(code);
      if (fresh) emitTurnChanged(io, code, fresh);
    }, 500);
  } else {
    emitTurnChanged(io, code, next);
  }
}

// ── main registration ──────────────────────────────────────────────────────

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // ── create_room ──────────────────────────────────────────────────────
    socket.on('create_room', (displayName: string) => {
      const room = createRoom(socket.id, displayName);
      playerRoom.set(socket.id, room.code);
      socket.join('game:' + room.code);
      socket.emit('room_state', room);
    });

    // ── join_room ────────────────────────────────────────────────────────
    socket.on(
      'join_room',
      (data: { code: string; displayName: string }) => {
        const result = joinRoom(
          data.code.toUpperCase(),
          socket.id,
          data.displayName
        );
        if (result instanceof Error) {
          socket.emit('error', result.message);
          return;
        }
        playerRoom.set(socket.id, result.code);
        socket.join('game:' + result.code);
        socket.emit('room_state', result);

        // Find the newly joined player and announce to room
        const newPlayer = result.players.find((p) => p.id === socket.id);
        if (newPlayer) {
          socket.to('game:' + result.code).emit('player_joined', newPlayer);
        }
      }
    );

    // ── start_game ───────────────────────────────────────────────────────
    socket.on('start_game', () => {
      const code = playerRoom.get(socket.id);
      if (!code) return;
      const room = getRoom(code);
      if (!room) return;
      if (room.hostId !== socket.id) {
        socket.emit('error', 'Only the host can start the game');
        return;
      }
      if (room.status !== 'lobby') {
        socket.emit('error', 'Game already started');
        return;
      }
      if (room.players.length < MIN_PLAYERS) {
        socket.emit('error', `Need at least ${MIN_PLAYERS} players`);
        return;
      }

      const started = startGame(room);
      setRoom(started);
      getOrCreateTimers(code);
      io.to('game:' + code).emit('game_started', started);
    });

    // ── roll_dice ────────────────────────────────────────────────────────
    socket.on('roll_dice', () => {
      const code = playerRoom.get(socket.id);
      if (!code) return;
      const room = getRoom(code);
      if (!room || room.status !== 'active') return;

      const timers = getOrCreateTimers(code);

      // Guard: go-out window is open
      if (timers.goOutTimer !== null) {
        socket.emit('error', 'Wait for the go-out window to close');
        return;
      }

      // Guard: must be this player's turn
      if (room.turnOrder[room.turnIndex] !== socket.id) {
        socket.emit('error', "It's not your turn");
        return;
      }

      const priorTurnIndex = room.turnIndex;
      const { room: newRoom, event } = processRoll(room);

      const isKill = event.result === KILL_NUMBER;

      if (!isKill) {
        // Restore priorTurnIndex so advanceTurn works correctly after the window
        newRoom.turnIndex = priorTurnIndex;
      }

      setRoom(newRoom);
      io.to('game:' + code).emit('roll_result', event);

      if (isKill) {
        // Round ends after animation completes
        setTimeout(() => {
          const r = getRoom(code);
          if (!r) return;
          endRound(io, code, r, 'kill');
        }, DICE_ANIMATION_MS);
      } else {
        // Open go-out window
        timers.goOutTimer = setTimeout(() => {
          timers.goOutTimer = null;
          const r = getRoom(code);
          if (!r) return;
          const roundCheck = checkRoundEnd(r);
          if (roundCheck.ended) {
            endRound(io, code, r, roundCheck.reason!);
          } else {
            const next = advanceTurn(r);
            setRoom(next);
            emitTurnChanged(io, code, next);
          }
        }, DICE_ANIMATION_MS + GO_OUT_WINDOW_MS);
      }
    });

    // ── go_out ───────────────────────────────────────────────────────────
    socket.on('go_out', () => {
      const code = playerRoom.get(socket.id);
      if (!code) return;
      const room = getRoom(code);
      if (!room || room.status !== 'active') return;

      const timers = getOrCreateTimers(code);

      // Guard: only valid during go-out window
      if (timers.goOutTimer === null) {
        socket.emit('error', 'Cannot go out outside the go-out window');
        return;
      }

      const player = room.players.find((p) => p.id === socket.id);
      if (!player || !player.isIn) {
        socket.emit('error', 'You are already out');
        return;
      }

      const updatedRoom = processGoOut(room, socket.id);
      setRoom(updatedRoom);

      const lockedScore =
        updatedRoom.players.find((p) => p.id === socket.id)?.roundScore ?? 0;

      io.to('game:' + code).emit('player_went_out', {
        playerId: socket.id,
        displayName: player.displayName,
        lockedScore,
      });

      const roundCheck = checkRoundEnd(updatedRoom);
      if (roundCheck.ended && roundCheck.reason === 'all_out') {
        clearTimeout(timers.goOutTimer!);
        timers.goOutTimer = null;
        endRound(io, code, updatedRoom, 'all_out');
      }
    });

    // ── send_chat ────────────────────────────────────────────────────────
    socket.on(
      'send_chat',
      (data: { text: string; type: 'message' | 'emoji' }) => {
        const code = playerRoom.get(socket.id);
        if (!code) return;
        const room = getRoom(code);
        if (!room) return;

        const text = String(data.text ?? '').slice(0, 200);
        if (!text.trim()) return;

        const player = room.players.find((p) => p.id === socket.id);
        if (!player) return;

        const msg: ChatMessage = {
          id: uuidv4(),
          playerId: socket.id,
          displayName: player.displayName,
          color: player.color,
          text,
          timestamp: Date.now(),
          type: data.type === 'emoji' ? 'emoji' : 'message',
        };

        io.to('game:' + code).emit('chat_message', msg);
      }
    );

    // ── disconnect ───────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const code: string | undefined = playerRoom.get(socket.id);
      if (!code) return;

      playerRoom.delete(socket.id);

      const room = updatePlayerConnection(code, socket.id, false);
      if (!room) return;

      io.to('game:' + code).emit('player_left', socket.id);

      // Transfer host if needed
      if (room.hostId === socket.id) {
        const next = room.players.find(
          (p) => p.id !== socket.id && p.isConnected
        );
        if (next) {
          room.hostId = next.id;
          io.to('game:' + code).emit('host_changed', next.id);
        }
      }

      const timers = getOrCreateTimers(code);

      // If it's their turn in an active game, auto-skip after timeout
      if (
        room.status === 'active' &&
        room.turnOrder[room.turnIndex] === socket.id &&
        timers.goOutTimer === null
      ) {
        timers.turnTimeout = setTimeout(() => {
          timers.turnTimeout = null;
          const r = getRoom(code);
          if (!r || r.status !== 'active') return;
          const next = advanceTurn(r);
          setRoom(next);
          emitTurnChanged(io, code, next);
        }, TURN_TIMEOUT_MS);
      }

      // Reconnect window: remove player after timeout
      const reconnectTimer = setTimeout(() => {
        timers.reconnectTimeouts.delete(socket.id);
        const r = getRoom(code);
        if (!r) return;

        // If game is active and player was still "in", treat as go-out
        if (r.status === 'active') {
          const p = r.players.find((pl) => pl.id === socket.id);
          if (p && p.isIn && timers.goOutTimer !== null) {
            const updated = processGoOut(r, socket.id);
            setRoom(updated);
            io.to('game:' + code).emit('player_went_out', {
              playerId: socket.id,
              displayName: p.displayName,
              lockedScore: p.roundScore,
            });
            const roundCheck = checkRoundEnd(updated);
            if (roundCheck.ended && roundCheck.reason === 'all_out') {
              clearTimeout(timers.goOutTimer!);
              timers.goOutTimer = null;
              endRound(io, code, updated, 'all_out');
            }
          }
        }

        leaveRoom(code, socket.id);
        io.to('game:' + code).emit('player_left', socket.id);
      }, RECONNECT_TIMEOUT_MS);

      timers.reconnectTimeouts.set(socket.id, reconnectTimer);
    });
  });
}
