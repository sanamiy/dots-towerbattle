export type Point = { x: number; y: number };
export type Pose = {
  name: string;
  image: string;
  points: Point[];
  collisionParts?: Point[][];
  colliderVersion?: string;
  sizeScale?: number;
  imageBounds?: { x: number; y: number; width: number; height: number };
};
export type Character = {
  poses?: Pose[];
  kind: string;
  name: string;
  color: string;
  points: Point[];
  collisionParts?: Point[][];
  colliderVersion?: string;
  sizeScale?: number;
  image?: string;
  imageBounds?: { x: number; y: number; width: number; height: number };
};
export type Profile = { name: string; character: Character; poseReadyAt?: number };
export type Player = {
  id: string;
  userId: string;
  name: string;
  character: Character;
  ready: boolean;
  alive: boolean;
  successes: number;
  rank?: number;
  connectedAt: number;
  poseReadyAt?: number;
  pauseUsed: boolean;
  idleTurns: number;
};
export type Piece = {
  id: string;
  character: Character;
  x: number;
  y: number;
  angle: number;
};
export type Frame = { t: number; poses: number[][] };
export type Flight = {
  startedAt: number;
  duration: number;
  frames: Frame[];
  pieces: Piece[];
  safe: boolean;
  reason: string;
  final: Piece[];
  playerId: string;
  forfeit?: boolean;
  trigger?: "command" | "timeout";
};
export type GameEvent = {
  seq: number;
  id: string;
  name: "turn.started" | "turn.resolved" | "match.finished";
  at: number;
  turnId: string;
  playerId?: string;
  text: string;
};
export type Room = {
  id: string;
  revision: number;
  passwordHash: string;
  hostId: string;
  phase: "lobby" | "preparing" | "aiming" | "falling" | "finished";
  players: Player[];
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  matchRequestedAt?: number;
  turnOrder: string[];
  completedAt?: number;
  turnId: string;
  turnNumber: number;
  active: number;
  deadline: number;
  pauseUntil?: number;
  pieces: Piece[];
  preview?: Piece;
  queue: number[];
  poseQueues: Record<string, number[]>;
  rng: number;
  flight?: Flight;
  events: GameEvent[];
  eventSeq: number;
  commands: { id: string; userId: string; fingerprint: string }[];
  lastResult?: { safe: boolean; text: string; playerId: string; trigger?: "command" | "timeout" };
  maxHeight: number;
};
export type Action =
  | { type: "move"; amount: number }
  | { type: "rotate"; degrees: number }
  | { type: "center" }
  | { type: "reset_rotation" }
  | { type: "drop" };
export type PublicRoom = Omit<
  Room,
  | "passwordHash"
  | "hostId"
  | "rng"
  | "queue"
  | "poseQueues"
  | "commands"
  | "players"
> & {
  players: (Omit<Player, "userId"> & { self: boolean; host: boolean; poseCount: number; posePreparation: string })[];
  myId: string;
  nextCharacter?: Character;
  serverTime: number;
};
export const TURN_MS = 45_000;
export const MATCH_MS = 12 * 60_000;
export const COLORS = ["#a7c8ef", "#f7bdce", "#bfce9f", "#d4bce9"];
