import {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  generateRoomCode,
  _clearRooms,
} from '../roomManager';
import { MAX_PLAYERS, ROOM_CODE_LENGTH } from '@shared/constants';

beforeEach(() => {
  _clearRooms();
});

describe('generateRoomCode', () => {
  test('returns a string of length ROOM_CODE_LENGTH', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
  });

  test('contains only unambiguous alphanumeric chars (no 0, O, 1, I, L)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
      expect(code).not.toMatch(/[01IOL]/);
    }
  });

  test('generates unique codes across multiple calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateRoomCode());
    }
    expect(codes.size).toBe(50);
  });
});

describe('createRoom', () => {
  test('creates a room with the host as the only player', () => {
    const room = createRoom('socket-1', 'Alice');
    expect(room.players).toHaveLength(1);
    expect(room.players[0].id).toBe('socket-1');
    expect(room.players[0].displayName).toBe('Alice');
    expect(room.hostId).toBe('socket-1');
  });

  test('room starts in lobby status', () => {
    const room = createRoom('socket-1', 'Alice');
    expect(room.status).toBe('lobby');
  });

  test('room starts at phase 1, round 1', () => {
    const room = createRoom('socket-1', 'Alice');
    expect(room.phase).toBe(1);
    expect(room.round).toBe(1);
  });

  test('room code is stored and retrievable', () => {
    const room = createRoom('socket-1', 'Alice');
    const fetched = getRoom(room.code);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(room.id);
  });

  test('host player has correct initial scores', () => {
    const room = createRoom('socket-1', 'Alice');
    const host = room.players[0];
    expect(host.totalScore).toBe(0);
    expect(host.roundScore).toBe(0);
    expect(host.phaseScores).toEqual([0, 0, 0, 0]);
    expect(host.isIn).toBe(true);
    expect(host.isConnected).toBe(true);
  });
});

describe('joinRoom', () => {
  test('adds a player to a lobby room', () => {
    const room = createRoom('socket-1', 'Alice');
    const result = joinRoom(room.code, 'socket-2', 'Bob');
    expect(result).not.toBeInstanceOf(Error);
    const updated = result as ReturnType<typeof joinRoom>;
    if (updated instanceof Error) throw updated;
    expect(updated.players).toHaveLength(2);
    expect(updated.players[1].displayName).toBe('Bob');
  });

  test('assigns a different color to each player', () => {
    const room = createRoom('socket-1', 'Alice');
    joinRoom(room.code, 'socket-2', 'Bob');
    const updated = getRoom(room.code)!;
    expect(updated.players[0].color).not.toBe(updated.players[1].color);
  });

  test('returns Error for nonexistent room code', () => {
    const result = joinRoom('ZZZZZZ', 'socket-2', 'Bob');
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/not found/i);
  });

  test('returns Error when game has already started', () => {
    const room = createRoom('socket-1', 'Alice');
    // Mutate status via getRoom reference
    const storedRoom = getRoom(room.code)!;
    storedRoom.status = 'active';
    const result = joinRoom(room.code, 'socket-2', 'Bob');
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/already started/i);
  });

  test('returns Error when room is full', () => {
    const room = createRoom('socket-1', 'Alice');
    for (let i = 2; i <= MAX_PLAYERS; i++) {
      const r = joinRoom(room.code, `socket-${i}`, `Player${i}`);
      expect(r).not.toBeInstanceOf(Error);
    }
    // One more should fail
    const result = joinRoom(room.code, `socket-${MAX_PLAYERS + 1}`, 'Extra');
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/full/i);
  });
});

describe('leaveRoom', () => {
  test('removes the player from the room', () => {
    const room = createRoom('socket-1', 'Alice');
    joinRoom(room.code, 'socket-2', 'Bob');
    const updated = leaveRoom(room.code, 'socket-2');
    expect(updated).not.toBeNull();
    expect(updated!.players).toHaveLength(1);
    expect(updated!.players[0].id).toBe('socket-1');
  });

  test('returns null when last player leaves (room deleted)', () => {
    const room = createRoom('socket-1', 'Alice');
    const result = leaveRoom(room.code, 'socket-1');
    expect(result).toBeNull();
    expect(getRoom(room.code)).toBeUndefined();
  });

  test('transfers host when host leaves', () => {
    const room = createRoom('socket-1', 'Alice');
    joinRoom(room.code, 'socket-2', 'Bob');
    const updated = leaveRoom(room.code, 'socket-1');
    expect(updated).not.toBeNull();
    expect(updated!.hostId).toBe('socket-2');
  });

  test('returns null for nonexistent room', () => {
    const result = leaveRoom('ZZZZZZ', 'socket-1');
    expect(result).toBeNull();
  });

  test('no-op when player not in room', () => {
    const room = createRoom('socket-1', 'Alice');
    const updated = leaveRoom(room.code, 'socket-99');
    expect(updated).not.toBeNull();
    expect(updated!.players).toHaveLength(1);
  });
});

describe('getRoom', () => {
  test('returns undefined for unknown code', () => {
    expect(getRoom('ZZZZZZ')).toBeUndefined();
  });

  test('returns the room for a known code', () => {
    const room = createRoom('socket-1', 'Alice');
    expect(getRoom(room.code)).toBeDefined();
  });
});
