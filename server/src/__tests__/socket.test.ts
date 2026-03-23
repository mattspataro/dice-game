/**
 * Integration test: two Socket.IO clients play a complete round.
 *
 * NOTE: Math.random mocks must be set up AFTER startTwoPlayerGame()
 * because startGame → shuffle consumes one random call before processRoll.
 */
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { registerSocketHandlers } from '../socketHandlers';
import { _clearRooms } from '../roomManager';
import { KILL_NUMBER } from '@shared/constants';
import { Room } from '@shared/types';

// ── helpers ──────────────────────────────────────────────────────────────

function waitFor<T>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 8000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Timeout waiting for "${event}"`)),
      timeoutMs
    );
    socket.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

function connect(url: string): ClientSocket {
  return ClientIO(url, { forceNew: true, transports: ['websocket'] });
}

// ── test suite ────────────────────────────────────────────────────────────

describe('Socket.IO integration', () => {
  let httpServer: ReturnType<typeof createServer>;
  let serverUrl: string;
  let p1: ClientSocket;
  let p2: ClientSocket;

  beforeAll((done) => {
    httpServer = createServer();
    const io = new Server(httpServer, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });
    registerSocketHandlers(io);
    httpServer.listen(0, () => {
      const port = (httpServer.address() as AddressInfo).port;
      serverUrl = `http://localhost:${port}`;
      done();
    });
  });

  afterAll(async () => {
    p1?.disconnect();
    p2?.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  beforeEach(() => {
    _clearRooms();
    jest.restoreAllMocks();
    // Disconnect any lingering clients so they don't pollute playerRoom map
    p1?.disconnect();
    p2?.disconnect();
  });

  // ── lobby flow ──────────────────────────────────────────────────────────

  test('create_room → room_state with code', (done) => {
    const client = connect(serverUrl);
    client.emit('create_room', 'Alice');
    client.once('room_state', (room: Room) => {
      expect(room.code).toHaveLength(6);
      expect(room.hostId).toBe(client.id);
      expect(room.players[0].displayName).toBe('Alice');
      client.disconnect();
      done();
    });
  });

  test('join_room → both clients get correct state', async () => {
    p1 = connect(serverUrl);
    p2 = connect(serverUrl);

    const roomStateP1 = waitFor<Room>(p1, 'room_state');
    p1.emit('create_room', 'Alice');
    const room = await roomStateP1;

    const [roomStateP2, playerJoinedP1] = await Promise.all([
      waitFor<Room>(p2, 'room_state'),
      waitFor(p1, 'player_joined'),
      new Promise<void>((res) => {
        p2.emit('join_room', { code: room.code, displayName: 'Bob' });
        res();
      }),
    ]);

    expect((roomStateP2 as Room).players).toHaveLength(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((playerJoinedP1 as any).displayName).toBe('Bob');
  });

  test('join non-existent room → error event', (done) => {
    const client = connect(serverUrl);
    client.emit('join_room', { code: 'XXXXXX', displayName: 'Ghost' });
    client.once('error', (msg: string) => {
      expect(msg).toMatch(/not found/i);
      client.disconnect();
      done();
    });
  });

  test('non-host cannot start game', async () => {
    p1 = connect(serverUrl);
    p2 = connect(serverUrl);

    const r1 = waitFor<Room>(p1, 'room_state');
    p1.emit('create_room', 'Alice');
    const room = await r1;

    await Promise.all([
      waitFor(p2, 'room_state'),
      new Promise<void>((res) => {
        p2.emit('join_room', { code: room.code, displayName: 'Bob' });
        res();
      }),
    ]);

    const err = waitFor<string>(p2, 'error');
    p2.emit('start_game');
    const msg = await err;
    expect(msg).toMatch(/host/i);
  });

  // ── game flow ────────────────────────────────────────────────────────────

  /**
   * Set up a started 2-player game.
   * IMPORTANT: set Math.random mocks AFTER calling this function,
   * because startGame → shuffle consumes one random call.
   */
  async function startTwoPlayerGame(): Promise<{
    room: Room;
    first: ClientSocket;
    second: ClientSocket;
  }> {
    p1 = connect(serverUrl);
    p2 = connect(serverUrl);

    const r1 = waitFor<Room>(p1, 'room_state');
    p1.emit('create_room', 'Alice');
    const lobby = await r1;

    await Promise.all([
      waitFor(p2, 'room_state'),
      new Promise<void>((res) => {
        p2.emit('join_room', { code: lobby.code, displayName: 'Bob' });
        res();
      }),
    ]);

    const [gameP1] = await Promise.all([
      waitFor<Room>(p1, 'game_started'),
      waitFor<Room>(p2, 'game_started'),
      new Promise<void>((res) => {
        p1.emit('start_game');
        res();
      }),
    ]);

    const room = gameP1 as Room;
    const firstId = room.turnOrder[room.turnIndex];
    const first = firstId === p1.id ? p1 : p2;
    const second = first === p1 ? p2 : p1;
    return { room, first, second };
  }

  test('only current player can roll', async () => {
    const { second } = await startTwoPlayerGame();

    const err = waitFor<string>(second, 'error');
    second.emit('roll_dice');
    const msg = await err;
    expect(msg).toMatch(/turn/i);
  });

  test('kill roll → round_ended after animation delay', async () => {
    const { first, second } = await startTwoPlayerGame();

    // Mock AFTER startTwoPlayerGame so shuffle doesn't consume the kill value
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce((KILL_NUMBER - 1) / 6) // → KILL_NUMBER
      .mockReturnValue(0.5); // seed

    const [r1, r2] = await Promise.all([
      waitFor<{ reason: string }>(first, 'round_ended', 10000),
      waitFor<{ reason: string }>(second, 'round_ended', 10000),
      new Promise<void>((res) => {
        first.emit('roll_dice');
        res();
      }),
    ]);

    expect((r1 as { reason: string }).reason).toBe('kill');
    expect((r2 as { reason: string }).reason).toBe('kill');
  }, 15000);

  test('non-kill roll → turn_changed after window', async () => {
    const { first, second } = await startTwoPlayerGame();

    // Mock AFTER startTwoPlayerGame
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(2 / 6) // → roll = 3 (non-kill)
      .mockReturnValue(0.5);     // seed

    const [tc1, tc2] = await Promise.all([
      waitFor<{ playerId: string }>(first, 'turn_changed', 10000),
      waitFor<{ playerId: string }>(second, 'turn_changed', 10000),
      new Promise<void>((res) => {
        first.emit('roll_dice');
        res();
      }),
    ]);

    expect((tc1 as { playerId: string }).playerId).toBeDefined();
    expect((tc1 as { playerId: string }).playerId).toBe(
      (tc2 as { playerId: string }).playerId
    );
  }, 15000);

  test('go_out during window → player_went_out; all out → round_ended', async () => {
    const { first, second } = await startTwoPlayerGame();

    // Mock AFTER startTwoPlayerGame: force a safe roll of 6
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(5 / 6) // → roll = 6
      .mockReturnValue(0.5);      // seed

    // Set up listeners before roll
    const wentOut1 = waitFor<{ playerId: string }>(first, 'player_went_out', 8000);
    const wentOut2 = waitFor<{ playerId: string }>(second, 'player_went_out', 8000);

    first.emit('roll_dice');

    // Wait for roll_result on both clients so window is confirmed open
    await Promise.all([
      waitFor(first, 'roll_result', 3000),
      waitFor(second, 'roll_result', 3000),
    ]);

    const roundEnd1 = waitFor<{ reason: string }>(first, 'round_ended', 8000);
    const roundEnd2 = waitFor<{ reason: string }>(second, 'round_ended', 8000);

    // Both go out → all_out → round ends immediately
    first.emit('go_out');
    second.emit('go_out');

    await wentOut1;
    await wentOut2;

    const re = await roundEnd1;
    expect((re as { reason: string }).reason).toBe('all_out');
    await roundEnd2;
  }, 15000);

  test('go_out outside window → error', async () => {
    const { first } = await startTwoPlayerGame();

    const err = waitFor<string>(first, 'error', 3000);
    first.emit('go_out');
    const msg = await err;
    expect(msg).toMatch(/window/i);
  });

  test('roll_dice during go-out window → error', async () => {
    const { first } = await startTwoPlayerGame();

    // Mock AFTER startTwoPlayerGame: force a safe roll of 3
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(2 / 6) // → roll = 3
      .mockReturnValue(0.5);

    first.emit('roll_dice');

    // Wait for roll_result so window is open
    await waitFor(first, 'roll_result', 3000);

    const err = waitFor<string>(first, 'error', 3000);
    first.emit('roll_dice');
    const msg = await err;
    expect(msg).toMatch(/window/i);
  }, 10000);

  test('send_chat → chat_message broadcast', async () => {
    p1 = connect(serverUrl);
    p2 = connect(serverUrl);

    const r1 = waitFor<Room>(p1, 'room_state');
    p1.emit('create_room', 'Alice');
    const lobby = await r1;

    await Promise.all([
      waitFor(p2, 'room_state'),
      new Promise<void>((res) => {
        p2.emit('join_room', { code: lobby.code, displayName: 'Bob' });
        res();
      }),
    ]);

    const chatP2 = waitFor<{ text: string }>(p2, 'chat_message');
    p1.emit('send_chat', { text: 'hello!', type: 'message' });
    const msg = await chatP2;
    expect((msg as { text: string }).text).toBe('hello!');
  });
});
