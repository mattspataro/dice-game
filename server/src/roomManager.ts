import { v4 as uuidv4 } from 'uuid';
import {
  MAX_PLAYERS,
  PLAYER_COLORS,
  ROOM_CODE_LENGTH,
} from '@shared/constants';
import { Player, Room } from '@shared/types';

// Alphanumeric chars excluding ambiguous: 0/O, 1/I/L
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const rooms = new Map<string, Room>();

export function generateRoomCode(): string {
  let code: string;
  do {
    code = Array.from(
      { length: ROOM_CODE_LENGTH },
      () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

export function createRoom(hostSocketId: string, hostName: string): Room {
  const code = generateRoomCode();
  const host: Player = {
    id: hostSocketId,
    displayName: hostName,
    color: PLAYER_COLORS[0],
    totalScore: 0,
    roundScore: 0,
    phaseScores: [0, 0, 0, 0],
    isIn: true,
    isConnected: true,
    lastSeen: Date.now(),
  };
  const room: Room = {
    id: uuidv4(),
    code,
    hostId: hostSocketId,
    players: [host],
    status: 'lobby',
    phase: 1,
    round: 1,
    turnIndex: 0,
    turnOrder: [],
    lastRoll: null,
    rollHistory: [],
  };
  rooms.set(code, room);
  return room;
}

export function joinRoom(
  code: string,
  socketId: string,
  displayName: string
): Room | Error {
  const room = rooms.get(code);
  if (!room) {
    return new Error(`Room "${code}" not found`);
  }
  if (room.status !== 'lobby') {
    return new Error('Game has already started');
  }
  if (room.players.length >= MAX_PLAYERS) {
    return new Error('Room is full');
  }
  const colorIndex = room.players.length % PLAYER_COLORS.length;
  const player: Player = {
    id: socketId,
    displayName,
    color: PLAYER_COLORS[colorIndex],
    totalScore: 0,
    roundScore: 0,
    phaseScores: [0, 0, 0, 0],
    isIn: true,
    isConnected: true,
    lastSeen: Date.now(),
  };
  room.players.push(player);
  return room;
}

export function leaveRoom(code: string, socketId: string): Room | null {
  const room = rooms.get(code);
  if (!room) return null;

  room.players = room.players.filter((p) => p.id !== socketId);

  if (room.players.length === 0) {
    rooms.delete(code);
    return null;
  }

  // Transfer host if needed
  if (room.hostId === socketId) {
    const nextConnected = room.players.find((p) => p.isConnected);
    if (nextConnected) {
      room.hostId = nextConnected.id;
    } else {
      room.hostId = room.players[0].id;
    }
  }

  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

/** Persist an updated room returned by the game engine */
export function setRoom(room: Room): void {
  rooms.set(room.code, room);
}

/** Mark a player connected or disconnected */
export function updatePlayerConnection(
  code: string,
  socketId: string,
  connected: boolean
): Room | null {
  const room = rooms.get(code);
  if (!room) return null;
  const player = room.players.find((p) => p.id === socketId);
  if (player) {
    player.isConnected = connected;
    player.lastSeen = Date.now();
  }
  return room;
}

/** Clears all rooms — for use in tests only */
export function _clearRooms(): void {
  rooms.clear();
}
