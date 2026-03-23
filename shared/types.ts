export interface Player {
  id: string;
  displayName: string;
  color: string;
  totalScore: number;
  roundScore: number;
  phaseScores: number[];
  isIn: boolean;
  isConnected: boolean;
  lastSeen: number;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  players: Player[];
  status: 'lobby' | 'active' | 'finished';
  phase: number;
  round: number;
  turnIndex: number;
  turnOrder: string[];
  lastRoll: number | null;
  rollHistory: RollEvent[];
}

export interface RollEvent {
  phase: number;
  round: number;
  rollerId: string;
  result: number;
  timestamp: number;
  seed: number;
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
