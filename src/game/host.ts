import Peer, { DataConnection } from 'peerjs';
import { GameState, Player, Block, BlockType, SelectableBlock } from './types';
import { MAP_WIDTH, MAP_HEIGHT, WIN_SCORE } from './constants';
import { getCellsForPlacement } from './utils';

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'];

export class GameHost {
  peer: Peer;
  connections: Record<string, DataConnection> = {};
  state: GameState;
  onStateUpdate: (state: GameState) => void;
  gameLoopInterval: any;
  colorIndex = 0;

  constructor(roomCode: string, hostName: string, onStateUpdate: (state: GameState) => void) {
    this.onStateUpdate = onStateUpdate;
    this.state = {
      phase: 'LOBBY',
      players: {},
      blocks: this.getInitialBlocks(),
      selectableBlocks: [],
      roomCode,
      hostId: 'host',
      roundResults: null,
      roundCount: 0,
    };

    this.addPlayer('host', hostName);

    this.peer = new Peer(`sch-game-2026-${roomCode}`);
    
    this.peer.on('open', id => {
      console.log('Host peer open:', id);
    });

    this.peer.on('connection', conn => {
      conn.on('data', (data: any) => this.handleMessage(conn.peer, data));
      conn.on('close', () => this.removePlayer(conn.peer));
      this.connections[conn.peer] = conn;
    });

    this.gameLoopInterval = setInterval(() => this.gameLoop(), 1000 / 60);
  }

  getInitialBlocks(): Block[] {
    return [
      { id: 'start', x: 0, y: 21, w: 4, h: 4, type: 'START', ownerId: null },
      { id: 'end', x: 41, y: 21, w: 4, h: 4, type: 'END', ownerId: null },
      { id: 'flag', x: 42, y: 19, w: 1, h: 2, type: 'FLAG', ownerId: null }
    ];
  }

  addPlayer(id: string, _name: string) {
    const playerName = `玩家${this.colorIndex + 1}`;
    this.state.players[id] = {
      id, name: playerName, color: COLORS[this.colorIndex % COLORS.length],
      x: 0, y: 0, vx: 0, vy: 0, score: 0,
      isDead: false, hasFinished: false, finishTime: 0, hasCoin: false,
      inputs: { left: false, right: false, jump: false },
      selectedBlockIndex: null, hasPlaced: false, placementX: 0, placementY: 0,
      placementRotation: 0,
      onGround: false, jumpHeld: false, deathCauseOwner: null
    };
    this.colorIndex++;
    this.broadcastState();
  }

  removePlayer(id: string) {
    delete this.state.players[id];
    delete this.connections[id];
    this.broadcastState();
  }

  handleMessage(peerId: string, data: any) {
    const p = this.state.players[peerId];
    if (data.type === 'JOIN') {
      this.addPlayer(peerId, data.name);
    } else if (data.type === 'ADD_AI' && peerId === 'host') {
      const aiId = `ai_${Math.random().toString(36).substr(2, 9)}`;
      this.addPlayer(aiId, `AI玩家`);
      this.state.players[aiId].isAI = true;
    } else if (data.type === 'INPUT' && p) {
      p.inputs = data.inputs;
    } else if (data.type === 'SELECT_BLOCK' && p && this.state.phase === 'SELECTION') {
      const block = this.state.selectableBlocks[data.index];
      if (block && !block.selectedBy && p.selectedBlockIndex === null) {
        block.selectedBy = peerId;
        p.selectedBlockIndex = data.index;
        this.checkSelectionComplete();
      }
    } else if (data.type === 'ROTATE_BLOCK' && p && this.state.phase === 'PLACEMENT') {
      p.placementRotation = (p.placementRotation + 1) % 4;
    } else if (data.type === 'HOVER_BLOCK' && p && this.state.phase === 'PLACEMENT') {
      p.placementX = data.x;
      p.placementY = data.y;
    } else if (data.type === 'PLACE_BLOCK' && p && this.state.phase === 'PLACEMENT') {
      if (!p.hasPlaced && p.selectedBlockIndex !== null) {
        const block = this.state.selectableBlocks[p.selectedBlockIndex];
        if (this.canPlace(block, data.x, data.y, p.placementRotation)) {
          this.placeBlock(block, data.x, data.y, peerId, p.placementRotation);
          p.hasPlaced = true;
          this.checkPlacementComplete();
        }
      }
    } else if (data.type === 'START_GAME' && peerId === 'host' && this.state.phase === 'LOBBY') {
      this.startRound();
    } else if (data.type === 'PLAY_AGAIN' && peerId === 'host' && this.state.phase === 'GAME_OVER') {
      this.state.blocks = this.getInitialBlocks();
      this.state.roundCount = 0;
      Object.values(this.state.players).forEach(p => p.score = 0);
      this.startRound();
    }
  }

  gameLoop() {
    this.updateAI();
    if (this.state.phase === 'PLAY') {
      this.updatePhysics();
      this.checkRoundEnd();
    }
    this.broadcastState();
  }

  updateAI() {
    const aiPlayers = Object.values(this.state.players).filter(p => p.isAI);
    if (aiPlayers.length === 0) return;

    if (this.state.phase === 'SELECTION') {
      aiPlayers.forEach(ai => {
        if (ai.selectedBlockIndex === null) {
          // Add some delay/randomness to selection
          if (Math.random() < 0.01) {
            const availableIndices = this.state.selectableBlocks
              .map((b, idx) => b.selectedBy ? -1 : idx)
              .filter(idx => idx !== -1);
            if (availableIndices.length > 0) {
              const pick = availableIndices[Math.floor(Math.random() * availableIndices.length)];
              this.handleMessage(ai.id, { type: 'SELECT_BLOCK', index: pick });
            }
          }
        }
      });
    } else if (this.state.phase === 'PLACEMENT') {
      aiPlayers.forEach(ai => {
        if (!ai.hasPlaced && ai.selectedBlockIndex !== null) {
          if (Math.random() < 0.02) {
            const block = this.state.selectableBlocks[ai.selectedBlockIndex];
            // Strategy: Place somewhere between start and end
            const startBlock = this.state.blocks.find(b => b.type === 'START');
            const endBlock = this.state.blocks.find(b => b.type === 'END');
            const minX = startBlock ? startBlock.x + startBlock.w : 5;
            const maxX = endBlock ? endBlock.x - block.w : 35;
            
            // Try up to 10 times to find a valid spot
            for (let i = 0; i < 10; i++) {
              const targetX = Math.floor(Math.random() * (maxX - minX)) + minX;
              let highestY = 23;
              for (const b of this.state.blocks) {
                if (b.x < targetX + block.w && b.x + b.w > targetX) {
                  if (b.y < highestY) highestY = b.y;
                }
              }
              
              let targetY = highestY - block.h;
              if (block.type === 'BRICK' || block.type === 'ICE') {
                targetY -= Math.floor(Math.random() * 3) + 1;
              }
              targetY = Math.max(0, Math.min(targetY, 24 - block.h));
              const rotation = Math.floor(Math.random() * 4);
              
              if (this.canPlace(block, targetX, targetY, rotation)) {
                ai.placementRotation = rotation;
                this.handleMessage(ai.id, { type: 'HOVER_BLOCK', x: targetX, y: targetY });
                this.handleMessage(ai.id, { type: 'PLACE_BLOCK', x: targetX, y: targetY });
                break;
              }
            }
          }
        }
      });
    } else if (this.state.phase === 'PLAY') {
      aiPlayers.forEach(ai => {
        if (ai.isDead || ai.hasFinished) {
          ai.inputs = { left: false, right: false, jump: false, giveUp: false };
          return;
        }

        const humans = Object.values(this.state.players).filter(p => !p.isAI);
        const humansDone = humans.length > 0 && humans.every(p => p.isDead || p.hasFinished);
        
        if (humansDone) {
          if (Math.random() < 0.02) { // Give up shortly after humans are done
            ai.inputs.giveUp = true;
            return;
          }
        }

        const endBlock = this.state.blocks.find(b => b.type === 'END');
        if (!endBlock) return;

        const targetX = endBlock.x + endBlock.w / 2;
        const aiCenterX = ai.x;

        // Basic movement
        ai.inputs.left = false;
        ai.inputs.right = false;
        ai.inputs.jump = false;

        // Random hesitation
        if (Math.random() < 0.02) return;

        // Basic movement direction
        let targetDir = 0;
        if (aiCenterX < targetX - 0.5) targetDir = 1;
        else if (aiCenterX > targetX + 0.5) targetDir = -1;

        // Stuck detection
        if (ai.lastX !== undefined && Math.abs(ai.x - ai.lastX) < 0.01) {
          ai.stuckFrames = (ai.stuckFrames || 0) + 1;
        } else {
          ai.stuckFrames = 0;
        }
        ai.lastX = ai.x;

        if (ai.stuckFrames && ai.stuckFrames > 30) {
          // If stuck for a while, try moving the other way briefly
          targetDir = -targetDir;
          if (ai.stuckFrames > 60) ai.stuckFrames = 0; // Reset after moving away
        }

        if (targetDir === 1) ai.inputs.right = true;
        else if (targetDir === -1) ai.inputs.left = true;

        if (targetDir !== 0) {
          let canJumpOverGap = false;
          let gapAhead = true;
          let obstacleAhead = false;
          let magmaAhead = false;
          let tallObstacleAhead = false;
          
          // Scan ahead up to 4 blocks
          for (let dist = 0.5; dist <= 4; dist += 0.5) {
            const checkX = ai.x + targetDir * dist;
            let hasGroundHere = false;
            let hasMagmaHere = false;
            let hasObstacleHere = false;
            
            for (const b of this.state.blocks) {
              if (checkX >= b.x && checkX <= b.x + b.w) {
                // Ground check
                if (b.y >= ai.y + 0.5 && b.y <= ai.y + 5) {
                  if (b.type === 'MAGMA') hasMagmaHere = true;
                  else hasGroundHere = true;
                }
                // Obstacle check
                if (b.y < ai.y + 0.9 && b.y + b.h > ai.y - 0.9) {
                  hasObstacleHere = true;
                  if (b.y < ai.y - 2 && dist < 1.5) {
                    tallObstacleAhead = true;
                  }
                }
              }
            }
            
            if (dist <= 1.5) {
              if (hasGroundHere) gapAhead = false;
              if (hasMagmaHere) magmaAhead = true;
              if (hasObstacleHere) obstacleAhead = true;
            } else {
              if (gapAhead && hasGroundHere && !hasMagmaHere) {
                canJumpOverGap = true;
              }
            }
          }

          // If there's a gap and we can't jump over it, stop moving to avoid suicide
          if (gapAhead && !canJumpOverGap) {
            ai.inputs.left = false;
            ai.inputs.right = false;
          }
          
          // If there's a tall obstacle we can't jump over, stop moving
          if (tallObstacleAhead) {
            ai.inputs.left = false;
            ai.inputs.right = false;
          }

          if ((gapAhead || obstacleAhead || magmaAhead) && ai.onGround) {
            if (Math.random() < 0.9) ai.inputs.jump = true;
          }

          if (!ai.onGround && ai.vy < 0) {
            if (gapAhead || obstacleAhead || magmaAhead) {
              ai.inputs.jump = true;
            } else if (Math.random() < 0.5) {
              ai.inputs.jump = true;
            }
          }
        }
      });
    }
  }

  broadcastState() {
    this.onStateUpdate({ ...this.state });
    const payload = { type: 'SYNC', state: this.state };
    for (const id in this.connections) {
      if (this.connections[id].open) {
        this.connections[id].send(payload);
      }
    }
  }

  updatePhysics() {
    for (const id in this.state.players) {
      const p = this.state.players[id];
      if (p.isDead || p.hasFinished) continue;

      if (p.inputs.giveUp) {
        p.isDead = true;
        p.deathCauseOwner = p.id;
        continue;
      }

      let friction = 0.9;
      if (p.onGround) {
        friction = p.groundType === 'ICE' ? 0.97 : 0.85;
      }

      const accel = p.onGround ? 0.05 : 0.025;
      if (p.inputs.left) p.vx -= accel;
      if (p.inputs.right) p.vx += accel;

      for (const b of this.state.blocks) {
        if (b.type === 'FAN') {
          let wz = { l: 0, r: 0, t: 0, b: 0 };
          if (b.rotation === 0) wz = { l: b.x, r: b.x + b.w, t: b.y - 3, b: b.y };
          else if (b.rotation === 1) wz = { l: b.x + b.w, r: b.x + b.w + 3, t: b.y, b: b.y + b.h };
          else if (b.rotation === 2) wz = { l: b.x, r: b.x + b.w, t: b.y + b.h, b: b.y + b.h + 3 };
          else if (b.rotation === 3) wz = { l: b.x - 3, r: b.x, t: b.y, b: b.y + b.h };

          const pRect = { l: p.x - 0.4, r: p.x + 0.4, t: p.y - 0.9, b: p.y + 0.9 };
          if (pRect.l < wz.r && pRect.r > wz.l && pRect.t < wz.b && pRect.b > wz.t) {
            let dist = 0;
            if (b.rotation === 0) dist = b.y - p.y;
            else if (b.rotation === 1) dist = p.x - (b.x + b.w);
            else if (b.rotation === 2) dist = p.y - (b.y + b.h);
            else if (b.rotation === 3) dist = b.x - p.x;
            
            dist = Math.max(0, Math.min(3, dist));
            const force = 0.08 * (1 - dist / 3);
            if (b.rotation === 0) p.vy -= force;
            else if (b.rotation === 1) p.vx += force;
            else if (b.rotation === 2) p.vy += force;
            else if (b.rotation === 3) p.vx -= force;
          }
        }
      }
      
      p.vx *= friction;
      if (p.vx > 0.28) p.vx = 0.28;
      if (p.vx < -0.28) p.vx = -0.28;

      let grav = 0.02;
      if (p.inputs.jump && p.vy < 0) grav = 0.01;
      p.vy += grav;
      if (p.vy > 0.4) p.vy = 0.4;
      if (p.vy < -0.6) p.vy = -0.6;

      if (p.inputs.jump && p.onGround && !p.jumpHeld) {
        p.vy = -0.38;
        p.onGround = false;
      }
      p.jumpHeld = p.inputs.jump;

      p.x += p.vx;
      this.handleCollisions(p, 'x');

      p.y += p.vy;
      p.onGround = false;
      this.handleCollisions(p, 'y');

      if (p.y - 0.9 < 0) {
        p.y = 0.9;
        if (p.vy < 0) p.vy = 0;
      }

      if (p.y > 27 || p.x < -2 || p.x > 47) {
        this.die(p, null);
      }

      this.checkMagma(p);
      this.checkCoin(p);
      this.checkFlag(p);
    }
  }

  handleCollisions(p: Player, axis: 'x' | 'y') {
    const pRect = { l: p.x - 0.4, r: p.x + 0.4, t: p.y - 0.9, b: p.y + 0.9 };
    for (const b of this.state.blocks) {
      if (!['BRICK', 'ICE', 'START', 'END', 'SPRING', 'FAN'].includes(b.type)) continue;
      const bRect = { l: b.x, r: b.x + b.w, t: b.y, b: b.y + b.h };
      
      if (pRect.l < bRect.r - 0.001 && pRect.r > bRect.l + 0.001 && pRect.t < bRect.b - 0.001 && pRect.b > bRect.t + 0.001) {
        if (b.type === 'SPRING') {
          if (axis === 'y') {
            if (b.rotation === 0 && p.vy > 0 && p.y < bRect.t) {
              p.y = bRect.t - 0.9; p.vy = -0.6; p.onGround = false; return;
            }
            if (b.rotation === 2 && p.vy < 0 && p.y > bRect.b) {
              p.y = bRect.b + 0.9; p.vy = 0.6; return;
            }
          } else if (axis === 'x') {
            if (b.rotation === 1 && p.vx < 0 && p.x > bRect.r) {
              p.x = bRect.r + 0.4; p.vx = 0.6; return;
            }
            if (b.rotation === 3 && p.vx > 0 && p.x < bRect.l) {
              p.x = bRect.l - 0.4; p.vx = -0.6; return;
            }
          }
        }

        if (axis === 'x') {
          if (p.vx > 0) { p.x = bRect.l - 0.4; p.vx = 0; }
          else if (p.vx < 0) { p.x = bRect.r + 0.4; p.vx = 0; }
        } else {
          if (p.vy > 0) { 
            p.y = bRect.t - 0.9; 
            p.vy = 0; 
            p.onGround = true; 
            p.groundType = b.type; 
          }
          else if (p.vy < 0) { p.y = bRect.b + 0.9; p.vy = 0; }
        }
        pRect.l = p.x - 0.4; pRect.r = p.x + 0.4; pRect.t = p.y - 0.9; pRect.b = p.y + 0.9;
      }
    }
  }

  checkMagma(p: Player) {
    const pRect = { l: p.x - 0.4, r: p.x + 0.4, t: p.y - 0.9, b: p.y + 0.9 };
    for (const b of this.state.blocks) {
      if (b.type !== 'MAGMA') continue;
      const bRect = { l: b.x + 0.05, r: b.x + b.w - 0.05, t: b.y + 0.05, b: b.y + b.h - 0.05 };
      if (pRect.l < bRect.r - 0.001 && pRect.r > bRect.l + 0.001 && pRect.t < bRect.b - 0.001 && pRect.b > bRect.t + 0.001) {
        this.die(p, b.ownerId);
        return;
      }
    }
  }

  checkCoin(p: Player) {
    const pRect = { l: p.x - 0.4, r: p.x + 0.4, t: p.y - 0.9, b: p.y + 0.9 };
    for (let i = 0; i < this.state.blocks.length; i++) {
      const b = this.state.blocks[i];
      if (b.type !== 'COIN' || b.pickedUp) continue;
      const bRect = { l: b.x + 0.05, r: b.x + b.w - 0.05, t: b.y + 0.05, b: b.y + b.h - 0.05 };
      if (pRect.l < bRect.r - 0.001 && pRect.r > bRect.l + 0.001 && pRect.t < bRect.b - 0.001 && pRect.b > bRect.t + 0.001) {
        p.hasCoin = true;
        b.pickedUp = true;
        return;
      }
    }
  }

  checkFlag(p: Player) {
    const pRect = { l: p.x - 0.4, r: p.x + 0.4, t: p.y - 0.9, b: p.y + 0.9 };
    for (const b of this.state.blocks) {
      if (b.type !== 'FLAG') continue;
      const bRect = { l: b.x, r: b.x + b.w, t: b.y, b: b.y + b.h };
      if (pRect.l < bRect.r - 0.001 && pRect.r > bRect.l + 0.001 && pRect.t < bRect.b - 0.001 && pRect.b > bRect.t + 0.001) {
        p.hasFinished = true;
        p.finishTime = Date.now();
        return;
      }
    }
  }

  die(p: Player, causeOwnerId: string | null) {
    p.isDead = true;
    p.deathCauseOwner = causeOwnerId;
    p.hasCoin = false;
  }

  startRound() {
    this.state.roundCount++;
    this.state.blocks.forEach(b => b.pickedUp = false);
    const players = Object.values(this.state.players);
    players.forEach((p, idx) => {
      p.x = 1 + idx * 0.5;
      p.y = 20.1;
      p.vx = 0;
      p.vy = 0;
      p.isDead = false;
      p.hasFinished = false;
      p.hasCoin = false;
      p.selectedBlockIndex = null;
      p.hasPlaced = false;
      p.deathCauseOwner = null;
    });
    
    this.generateSelectableBlocks();
    this.state.phase = 'SELECTION';
  }

  generateSelectableBlocks() {
    const blocks: SelectableBlock[] = [];
    const types: BlockType[] = ['BRICK', 'ICE', 'MAGMA'];
    
    const pool: {shape: 'rect'|'L', w: number, h: number}[] = [
      {shape: 'rect', w: 1, h: 1},
      {shape: 'rect', w: 2, h: 1},
      {shape: 'rect', w: 2, h: 1},
      {shape: 'rect', w: 4, h: 1},
      {shape: 'rect', w: 5, h: 1},
      {shape: 'rect', w: 2, h: 2},
      {shape: 'L', w: 4, h: 4}
    ];
    
    const type1 = types[Math.floor(Math.random() * types.length)];
    let type2 = types[Math.floor(Math.random() * types.length)];
    while (type2 === type1) type2 = types[Math.floor(Math.random() * types.length)];
    
    const playerCount = Object.keys(this.state.players).length;
    const targetCount = playerCount + 2;
    
    const existingCoins = this.state.blocks.filter(b => b.type === 'COIN').length;
    if (existingCoins < 2 && Math.random() < 0.5) {
      blocks.push({ type: 'COIN', w: 1, h: 1, shape: 'rect', selectedBy: null });
    }
    
    if (this.state.roundCount > 12 || Math.random() < 0.5) {
      const bombSizes = [{w:1,h:1}, {w:2,h:2}, {w:3,h:3}];
      const size = bombSizes[Math.floor(Math.random() * bombSizes.length)];
      blocks.push({ type: 'BOMB', w: size.w, h: size.h, shape: 'rect', selectedBy: null });
    }

    if (Math.random() < 0.3) {
      blocks.push({ type: 'SPRING', w: 3, h: 1, shape: 'rect', selectedBy: null });
    }

    if (Math.random() < 0.3) {
      blocks.push({ type: 'FAN', w: 3, h: 1, shape: 'rect', selectedBy: null });
    }
    
    while (blocks.length < targetCount) {
      let t = types[Math.floor(Math.random() * types.length)];
      if (blocks.length === 0) t = type1;
      if (blocks.length === 1) t = type2;
      const s = pool[Math.floor(Math.random() * pool.length)];
      if (s.shape === 'L' && t === 'MAGMA') t = 'BRICK';
      blocks.push({ type: t, w: s.w, h: s.h, shape: s.shape, selectedBy: null });
    }
    
    blocks.sort(() => Math.random() - 0.5);
    this.state.selectableBlocks = blocks.slice(0, targetCount).map(b => ({...b, selectedBy: null}));
  }

  checkSelectionComplete() {
    const allSelected = Object.values(this.state.players).every(p => p.selectedBlockIndex !== null);
    if (allSelected) {
      setTimeout(() => {
        this.state.phase = 'PLACEMENT';
      }, 500);
    }
  }

  canPlace(block: SelectableBlock, x: number, y: number, rot: number) {
    const cells = getCellsForPlacement(block, x, y, rot);
    
    const safeZones = [
      { l: 0, r: 4, t: 18, b: 25 },
      { l: 41, r: 45, t: 18, b: 25 }
    ];

    for (const c of cells) {
      const bRect = { l: c.x, r: c.x + c.w, t: c.y, b: c.y + c.h };
      if (bRect.l < 0 || bRect.r > MAP_WIDTH || bRect.t < 0 || bRect.b > MAP_HEIGHT) return false;
      
      for (const z of safeZones) {
        if (bRect.l < z.r && bRect.r > z.l && bRect.t < z.b && bRect.b > z.t) return false;
      }
      
      if (block.type !== 'BOMB') {
        for (const b of this.state.blocks) {
          if (['START', 'END', 'FLAG'].includes(b.type)) continue;
          const eRect = { l: b.x, r: b.x + b.w, t: b.y, b: b.y + b.h };
          if (bRect.l < eRect.r && bRect.r > eRect.l && bRect.t < eRect.b && bRect.b > eRect.t) return false;
        }
      }
    }
    return true;
  }

  placeBlock(block: SelectableBlock, x: number, y: number, ownerId: string, rot: number) {
    const cells = getCellsForPlacement(block, x, y, rot);
    const groupId = Math.random().toString(36).substr(2, 9);
    
    if (block.type === 'BOMB') {
      const groupsToDestroy = new Set<string>();
      const idsToDestroy = new Set<string>();
      
      cells.forEach(c => {
        const bRect = { l: c.x, r: c.x + c.w, t: c.y, b: c.y + c.h };
        this.state.blocks.forEach(b => {
          if (['START', 'END', 'FLAG'].includes(b.type)) return;
          const eRect = { l: b.x, r: b.x + b.w, t: b.y, b: b.y + b.h };
          const overlap = bRect.l < eRect.r && bRect.r > eRect.l && bRect.t < eRect.b && bRect.b > eRect.t;
          if (overlap) {
            idsToDestroy.add(b.id);
            if (b.groupId) groupsToDestroy.add(b.groupId);
          }
        });
      });

      this.state.blocks = this.state.blocks.filter(b => 
        !idsToDestroy.has(b.id) && !(b.groupId && groupsToDestroy.has(b.groupId))
      );
    } else {
      cells.forEach(c => {
        this.state.blocks.push({
          id: Math.random().toString(36).substr(2, 9),
          x: c.x, y: c.y, w: c.w, h: c.h, type: block.type, ownerId, rotation: rot,
          groupId
        });
      });
    }
  }

  checkPlacementComplete() {
    const allPlaced = Object.values(this.state.players).every(p => p.hasPlaced);
    if (allPlaced) {
      setTimeout(() => {
        this.state.phase = 'PLAY';
      }, 500);
    }
  }

  checkRoundEnd() {
    const players = Object.values(this.state.players);
    const allDone = players.every(p => p.isDead || p.hasFinished);
    if (allDone && this.state.phase === 'PLAY') {
      this.state.phase = 'ROUND_END';
      this.calculateScores();
      
      setTimeout(() => {
        const hasWinner = players.some(p => p.score >= WIN_SCORE);
        if (hasWinner) {
          this.state.phase = 'GAME_OVER';
        } else {
          this.startRound();
        }
      }, 4000);
    }
  }

  calculateScores() {
    const players = Object.values(this.state.players);
    const finished = players.filter(p => p.hasFinished).sort((a, b) => a.finishTime - b.finishTime);
    
    let multiplier = 1;
    const isShowdown = this.state.roundCount > 12;
    
    if (isShowdown) {
      multiplier = 2;
    } else {
      if (finished.length === 0) multiplier = 0;
      else if (finished.length === players.length && players.length > 0) multiplier = 0.1;
    }
    
    const results: any = {};
    players.forEach(p => results[p.id] = { points: 0, details: [] });
    
    finished.forEach((p, idx) => {
      let pts = 1;
      let details = [`到达终点: +${1}`];
      
      if (p.hasCoin) {
        pts += 0.8;
        details.push(`携带金币: +${0.8}`);
      }
      if (finished.length === 1) {
        pts += 0.5;
        details.push(`唯一到达: +${0.5}`);
      } else if (idx === 0) {
        pts += 0.25;
        details.push(`第一名: +${0.25}`);
      }
      
      const finalPts = pts * multiplier;
      results[p.id].points += finalPts;
      results[p.id].details.push(...details);
      
      if (isShowdown) {
        results[p.id].details.push(`决战模式倍率: x2 = +${finalPts.toFixed(2)}`);
      } else if (multiplier === 0.1) {
        results[p.id].details.push(`太简单了！全员通过倍率: x0.1 = +${finalPts.toFixed(2)}`);
      } else if (multiplier !== 1) {
        results[p.id].details.push(`全员/无人到达倍率: x${multiplier} = +${finalPts.toFixed(2)}`);
      }
    });
    
    players.forEach(p => {
      if (p.isDead && p.deathCauseOwner && p.deathCauseOwner !== p.id) {
        const pts = 0.2 * multiplier;
        results[p.deathCauseOwner].points += pts;
        results[p.deathCauseOwner].details.push(`陷阱击杀: +${pts}`);
      }
    });
    
    players.forEach(p => {
      p.score += results[p.id].points;
    });
    
    this.state.roundResults = results;
  }
}
