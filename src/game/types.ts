export type BlockType = 'BRICK' | 'ICE' | 'MAGMA' | 'COIN' | 'BOMB' | 'START' | 'END' | 'FLAG' | 'SPRING' | 'FAN';

export interface Block {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: BlockType;
  ownerId: string | null;
  pickedUp?: boolean;
  rotation?: number;
  groupId?: string;
}

export interface SelectableBlock {
  type: BlockType;
  w: number;
  h: number;
  shape: 'rect' | 'L';
  selectedBy: string | null;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  score: number;
  isDead: boolean;
  hasFinished: boolean;
  finishTime: number;
  hasCoin: boolean;
  inputs: { left: boolean; right: boolean; jump: boolean; giveUp?: boolean };
  selectedBlockIndex: number | null;
  hasPlaced: boolean;
  placementX: number;
  placementY: number;
  placementRotation: number;
  onGround: boolean;
  groundType?: string;
  jumpHeld: boolean;
  deathCauseOwner: string | null;
  isAI?: boolean;
  stuckFrames?: number;
  lastX?: number;
  aiDirection?: number;
}

export interface GameState {
  phase: 'LOBBY' | 'SELECTION' | 'PLACEMENT' | 'COUNTDOWN' | 'PLAY' | 'ROUND_END' | 'GAME_OVER';
  players: Record<string, Player>;
  blocks: Block[];
  selectableBlocks: SelectableBlock[];
  roomCode: string;
  hostId: string;
  roundResults: any;
  roundCount: number;
  consecutiveFails: number;
  countdownValue?: number;
}
