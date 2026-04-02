import React, { useState, useEffect, useRef } from 'react';
import { GameHost } from './game/host';
import { GameClient } from './game/client';
import { GameState, BlockType, Block, Player } from './game/types';
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, WIN_SCORE } from './game/constants';
import { getCellsForPlacement } from './game/utils';

export default function App() {
  const [roomCode, setRoomCode] = useState('');
  const [connected, setConnected] = useState(false);
  const [isHost, setIsHost] = useState(false);
  
  const hostRef = useRef<GameHost | null>(null);
  const clientRef = useRef<GameClient | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const myId = isHost ? 'host' : clientRef.current?.myId || '';

  const handleCreateRoom = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setRoomCode(code);
    setIsHost(true);
    hostRef.current = new GameHost(code, '', setGameState);
    setConnected(true);
  };

  const handleJoinRoom = () => {
    if (!roomCode || roomCode.length !== 6) return alert('请输入6位房间号');
    setIsHost(false);
    clientRef.current = new GameClient(roomCode, '', setGameState, () => {
      setConnected(true);
    }, (err) => {
      alert('连接失败: ' + err);
    });
  };

  useEffect(() => {
    if (!connected) return;
    const keys = { left: false, right: false, jump: false, giveUp: false };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.left = true;
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.right = true;
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.jump = true;
      if (e.key === 'r' || e.key === 'R') {
        if (gameState?.phase === 'PLACEMENT') {
          if (isHost) hostRef.current?.handleMessage('host', { type: 'ROTATE_BLOCK' });
          else clientRef.current?.send({ type: 'ROTATE_BLOCK' });
        } else if (gameState?.phase === 'PLAY') {
          keys.giveUp = true;
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.left = false;
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.right = false;
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.jump = false;
      if (e.key === 'r' || e.key === 'R') keys.giveUp = false;
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    const interval = setInterval(() => {
      if (isHost) {
        hostRef.current?.handleMessage('host', { type: 'INPUT', inputs: keys });
      } else {
        clientRef.current?.send({ type: 'INPUT', inputs: keys });
      }
    }, 1000 / 60);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearInterval(interval);
    };
  }, [connected, isHost]);

  useEffect(() => {
    if (!gameState || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let x = 0; x <= MAP_WIDTH; x++) {
      ctx.beginPath(); ctx.moveTo(x * TILE_SIZE, 0); ctx.lineTo(x * TILE_SIZE, MAP_HEIGHT * TILE_SIZE); ctx.stroke();
    }
    for (let y = 0; y <= MAP_HEIGHT; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * TILE_SIZE); ctx.lineTo(MAP_WIDTH * TILE_SIZE, y * TILE_SIZE); ctx.stroke();
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 13 * TILE_SIZE, 4 * TILE_SIZE, 7 * TILE_SIZE);
    ctx.fillRect(41 * TILE_SIZE, 13 * TILE_SIZE, 4 * TILE_SIZE, 7 * TILE_SIZE);

    gameState.blocks.forEach(b => {
      if (b.type === 'COIN' && b.pickedUp) return;

      if (b.type === 'FLAG') {
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(b.x * TILE_SIZE + 8, b.y * TILE_SIZE, 6, b.h * TILE_SIZE);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(b.x * TILE_SIZE + 14, b.y * TILE_SIZE);
        ctx.lineTo(b.x * TILE_SIZE + 34, b.y * TILE_SIZE + 15);
        ctx.lineTo(b.x * TILE_SIZE + 14, b.y * TILE_SIZE + 30);
        ctx.fill();
        return;
      }

      ctx.fillStyle = getBlockColor(b.type);
      ctx.fillRect(b.x * TILE_SIZE, b.y * TILE_SIZE, b.w * TILE_SIZE, b.h * TILE_SIZE);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(b.x * TILE_SIZE, b.y * TILE_SIZE, b.w * TILE_SIZE, b.h * TILE_SIZE);
      
      if (b.type === 'FLAG') {
        ctx.fillStyle = 'red';
        ctx.fillRect(b.x * TILE_SIZE + 5, b.y * TILE_SIZE + 5, 30, 20);
      }
      if (b.type === 'BOMB') {
        ctx.fillStyle = 'red';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('B', (b.x + b.w/2) * TILE_SIZE, (b.y + b.h/2 + 0.2) * TILE_SIZE);
      }
      if (b.type === 'SPRING') {
        ctx.fillStyle = '#10b981';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('S', (b.x + b.w/2) * TILE_SIZE, (b.y + b.h/2 + 0.2) * TILE_SIZE);
        
        ctx.fillStyle = 'white';
        if (b.rotation === 0) ctx.fillRect((b.x + b.w/2) * TILE_SIZE - 5, b.y * TILE_SIZE + 2, 10, 4);
        if (b.rotation === 1) ctx.fillRect((b.x + b.w) * TILE_SIZE - 6, (b.y + b.h/2) * TILE_SIZE - 5, 4, 10);
        if (b.rotation === 2) ctx.fillRect((b.x + b.w/2) * TILE_SIZE - 5, (b.y + b.h) * TILE_SIZE - 6, 10, 4);
        if (b.rotation === 3) ctx.fillRect(b.x * TILE_SIZE + 2, (b.y + b.h/2) * TILE_SIZE - 5, 4, 10);
      }
      if (b.type === 'FAN') {
        ctx.fillStyle = '#3b82f6';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('F', (b.x + b.w/2) * TILE_SIZE, (b.y + b.h/2 + 0.2) * TILE_SIZE);

        ctx.fillStyle = 'white';
        if (b.rotation === 0) ctx.fillRect((b.x + b.w/2) * TILE_SIZE - 5, b.y * TILE_SIZE + 2, 10, 4);
        if (b.rotation === 1) ctx.fillRect((b.x + b.w) * TILE_SIZE - 6, (b.y + b.h/2) * TILE_SIZE - 5, 4, 10);
        if (b.rotation === 2) ctx.fillRect((b.x + b.w/2) * TILE_SIZE - 5, (b.y + b.h) * TILE_SIZE - 6, 10, 4);
        if (b.rotation === 3) ctx.fillRect(b.x * TILE_SIZE + 2, (b.y + b.h/2) * TILE_SIZE - 5, 4, 10);

        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        if (b.rotation === 0) ctx.fillRect(b.x * TILE_SIZE, (b.y - 3) * TILE_SIZE, b.w * TILE_SIZE, 3 * TILE_SIZE);
        if (b.rotation === 1) ctx.fillRect((b.x + b.w) * TILE_SIZE, b.y * TILE_SIZE, 3 * TILE_SIZE, b.h * TILE_SIZE);
        if (b.rotation === 2) ctx.fillRect(b.x * TILE_SIZE, (b.y + b.h) * TILE_SIZE, b.w * TILE_SIZE, 3 * TILE_SIZE);
        if (b.rotation === 3) ctx.fillRect((b.x - 3) * TILE_SIZE, b.y * TILE_SIZE, 3 * TILE_SIZE, b.h * TILE_SIZE);
      }
    });

    (Object.values(gameState.players) as Player[]).forEach(p => {
      if (p.isDead) return;
      ctx.fillStyle = p.color;
      ctx.fillRect((p.x - 0.4) * TILE_SIZE, (p.y - 0.9) * TILE_SIZE, 0.8 * TILE_SIZE, 1.8 * TILE_SIZE);
      
      ctx.fillStyle = '#000';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, p.x * TILE_SIZE, (p.y - 1) * TILE_SIZE);
      
      if (p.hasCoin) {
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(p.x * TILE_SIZE, (p.y - 1.2) * TILE_SIZE, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    });

    if (gameState.phase === 'PLACEMENT') {
      (Object.values(gameState.players) as Player[]).forEach(p => {
        if (!p.hasPlaced && p.selectedBlockIndex !== null) {
          const b = gameState.selectableBlocks[p.selectedBlockIndex];
          if (b) {
            ctx.fillStyle = p.id === myId ? 'rgba(0, 255, 0, 0.5)' : 'rgba(100, 100, 100, 0.3)';
            const cells = getCellsForPlacement(b, p.placementX, p.placementY, p.placementRotation);
            cells.forEach(c => {
              ctx.fillRect(c.x * TILE_SIZE, c.y * TILE_SIZE, c.w * TILE_SIZE, c.h * TILE_SIZE);
            });

            if (b.type === 'SPRING' || b.type === 'FAN') {
              const bounds = {
                minX: Math.min(...cells.map(c => c.x)),
                minY: Math.min(...cells.map(c => c.y)),
                maxX: Math.max(...cells.map(c => c.x + c.w)),
                maxY: Math.max(...cells.map(c => c.y + c.h))
              };
              const bx = bounds.minX;
              const by = bounds.minY;
              const bw = bounds.maxX - bounds.minX;
              const bh = bounds.maxY - bounds.minY;
              
              ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
              if (p.placementRotation === 0) ctx.fillRect((bx + bw/2) * TILE_SIZE - 5, by * TILE_SIZE + 2, 10, 4);
              if (p.placementRotation === 1) ctx.fillRect((bx + bw) * TILE_SIZE - 6, (by + bh/2) * TILE_SIZE - 5, 4, 10);
              if (p.placementRotation === 2) ctx.fillRect((bx + bw/2) * TILE_SIZE - 5, (by + bh) * TILE_SIZE - 6, 10, 4);
              if (p.placementRotation === 3) ctx.fillRect(bx * TILE_SIZE + 2, (by + bh/2) * TILE_SIZE - 5, 4, 10);

              if (b.type === 'FAN') {
                ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
                if (p.placementRotation === 0) ctx.fillRect(bx * TILE_SIZE, (by - 3) * TILE_SIZE, bw * TILE_SIZE, 3 * TILE_SIZE);
                if (p.placementRotation === 1) ctx.fillRect((bx + bw) * TILE_SIZE, by * TILE_SIZE, 3 * TILE_SIZE, bh * TILE_SIZE);
                if (p.placementRotation === 2) ctx.fillRect(bx * TILE_SIZE, (by + bh) * TILE_SIZE, bw * TILE_SIZE, 3 * TILE_SIZE);
                if (p.placementRotation === 3) ctx.fillRect((bx - 3) * TILE_SIZE, by * TILE_SIZE, 3 * TILE_SIZE, bh * TILE_SIZE);
              }
            }
          }
        }
      });
    }
  }, [gameState, myId]);

  const getBlockColor = (type: string) => {
    switch (type) {
      case 'BRICK': return '#8B4513';
      case 'ICE': return '#ADD8E6';
      case 'MAGMA': return '#FF4500';
      case 'COIN': return '#FFD700';
      case 'BOMB': return '#333333';
      case 'START': return '#808080';
      case 'END': return '#A9A9A9';
      case 'FLAG': return '#228B22';
      case 'SPRING': return '#10b981';
      case 'FAN': return '#3b82f6';
      default: return '#FFF';
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gameState || gameState.phase !== 'PLACEMENT') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);
    
    if (isHost) {
      hostRef.current?.handleMessage('host', { type: 'HOVER_BLOCK', x, y });
    } else {
      clientRef.current?.send({ type: 'HOVER_BLOCK', x, y });
    }
  };

  const handleMouseClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gameState || gameState.phase !== 'PLACEMENT') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);
    
    if (isHost) {
      hostRef.current?.handleMessage('host', { type: 'PLACE_BLOCK', x, y });
    } else {
      clientRef.current?.send({ type: 'PLACE_BLOCK', x, y });
    }
  };

  const selectBlock = (index: number) => {
    if (isHost) {
      hostRef.current?.handleMessage('host', { type: 'SELECT_BLOCK', index });
    } else {
      clientRef.current?.send({ type: 'SELECT_BLOCK', index });
    }
  };

  const startGame = () => {
    if (isHost) hostRef.current?.handleMessage('host', { type: 'START_GAME' });
  };

  const playAgain = () => {
    if (isHost) hostRef.current?.handleMessage('host', { type: 'PLAY_AGAIN' });
  };

  const getBlockName = (type: string, w: number, h: number, shape: string) => {
    const names: Record<string, string> = {
      'BRICK': '砖块',
      'ICE': '冰块',
      'MAGMA': '岩浆',
      'COIN': '金币',
      'BOMB': '炸弹',
      'SPRING': '弹簧',
      'FAN': '风扇'
    };
    const shapeStr = shape === 'L' ? 'L形' : `${w}x${h}`;
    return `${names[type] || type} ${shapeStr}`;
  };

  if (!connected) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-8">超级牛马</h1>
          <div className="space-y-4">
            <button
              onClick={handleCreateRoom}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
            >
              创建房间
            </button>
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300"></div></div>
              <div className="relative flex justify-center"><span className="bg-white px-2 text-sm text-gray-500">或</span></div>
            </div>
            <div>
              <input
                type="text"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none mb-2"
                placeholder="输入6位房间号"
                maxLength={6}
              />
              <button
                onClick={handleJoinRoom}
                className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition"
              >
                加入房间
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center py-8 overflow-x-auto">
      <div className="w-full max-w-[1800px] mb-4 bg-gray-800 p-4 rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-bold text-xl">房间号: {gameState?.roomCode}</h2>
          <div className="text-white">阶段: {
            gameState?.phase === 'LOBBY' ? '等待开始' :
            gameState?.phase === 'SELECTION' ? '选择方块' :
            gameState?.phase === 'PLACEMENT' ? '放置方块 (按R键旋转)' :
            gameState?.phase === 'PLAY' ? '游玩中 (按R键放弃)' :
            gameState?.phase === 'ROUND_END' ? '回合结算' : '游戏结束'
          }</div>
        </div>
        
        {/* Score Progress Bars */}
        <div className="space-y-2">
          {gameState && (Object.values(gameState.players) as Player[]).map(p => (
            <div key={p.id} className="flex items-center space-x-2">
              <div className="w-24 text-white text-sm truncate" style={{ color: p.color }}>{p.name}</div>
              <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden relative">
                <div 
                  className="h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (p.score / WIN_SCORE) * 100)}%`, backgroundColor: p.color }}
                />
              </div>
              <div className="w-12 text-white text-sm text-right">{p.score.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={MAP_WIDTH * TILE_SIZE}
          height={MAP_HEIGHT * TILE_SIZE}
          className="bg-white rounded-lg shadow-2xl cursor-crosshair"
          onMouseMove={handleMouseMove}
          onClick={handleMouseClick}
        />

        {/* Overlays */}
        {gameState?.phase === 'LOBBY' && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center rounded-lg">
            <h2 className="text-white text-3xl font-bold mb-8">等待玩家加入...</h2>
            <div className="flex space-x-4 mb-8">
              {(Object.values(gameState.players) as Player[]).map(p => (
                <div key={p.id} className="px-4 py-2 rounded-full text-white font-bold" style={{ backgroundColor: p.color }}>
                  {p.name}
                </div>
              ))}
            </div>
            {isHost && (
              <button onClick={startGame} className="bg-blue-600 text-white px-8 py-3 rounded-lg text-xl font-bold hover:bg-blue-700 transition">
                开始游戏
              </button>
            )}
          </div>
        )}

        {gameState?.phase === 'SELECTION' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center rounded-lg p-8">
            <h2 className="text-white text-3xl font-bold mb-8">选择一个方块</h2>
            <div className="flex flex-wrap justify-center gap-4">
              {gameState.selectableBlocks.map((b, idx) => (
                <div 
                  key={idx}
                  onClick={() => selectBlock(idx)}
                  className={`relative p-4 rounded-lg cursor-pointer transition ${b.selectedBy ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                  style={{ backgroundColor: b.selectedBy ? '#374151' : '#1f2937', border: `2px solid ${b.selectedBy ? gameState.players[b.selectedBy]?.color : 'transparent'}` }}
                >
                  <div 
                    style={{ 
                      width: b.w * 20, 
                      height: b.h * 20, 
                      backgroundColor: b.shape === 'L' ? 'transparent' : getBlockColor(b.type),
                      border: b.shape === 'L' ? 'none' : '1px solid #000',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'red',
                      fontWeight: 'bold',
                      position: 'relative'
                    }}
                  >
                    {b.shape === 'L' && getCellsForPlacement(b, 0, 0, 0).map((c, i) => (
                      <div key={i} style={{
                        position: 'absolute',
                        left: c.x * 20,
                        top: c.y * 20,
                        width: 20,
                        height: 20,
                        backgroundColor: getBlockColor(b.type),
                        border: '1px solid #000'
                      }} />
                    ))}
                    {b.type === 'BOMB' ? 'B' : ''}
                    {b.type === 'SPRING' ? 'S' : ''}
                    {b.type === 'FAN' ? 'F' : ''}
                  </div>
                  <div className="text-white text-xs mt-2 text-center">{getBlockName(b.type, b.w, b.h, b.shape)}</div>
                  {b.selectedBy && (
                    <div className="absolute -top-2 -right-2 text-xs px-2 py-1 rounded-full text-white" style={{ backgroundColor: gameState.players[b.selectedBy]?.color }}>
                      已选
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {gameState?.phase === 'ROUND_END' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center rounded-lg p-8">
            <h2 className="text-white text-3xl font-bold mb-8">回合结算</h2>
            <div className="space-y-4 w-full max-w-md">
              {(Object.values(gameState.players) as Player[]).map(p => {
                const res = gameState.roundResults?.[p.id];
                if (!res) return null;
                return (
                  <div key={p.id} className="bg-gray-800 p-4 rounded-lg border-l-4" style={{ borderColor: p.color }}>
                    <div className="flex justify-between text-white font-bold mb-2">
                      <span>{p.name}</span>
                      <span>+{res.points.toFixed(2)} 分</span>
                    </div>
                    <div className="text-gray-400 text-sm space-y-1">
                      {res.details.map((d: string, i: number) => <div key={i}>{d}</div>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {gameState?.phase === 'GAME_OVER' && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center rounded-lg">
            <h2 className="text-yellow-400 text-5xl font-bold mb-4">游戏结束</h2>
            <div className="text-white text-2xl mb-8">
              获胜者: {
                (Object.values(gameState.players) as Player[])
                  .sort((a, b) => b.score - a.score)
                  .filter((p, i, arr) => p.score === arr[0].score)
                  .map(p => p.name)
                  .join(', ')
              }
            </div>
            {isHost && (
              <button onClick={playAgain} className="bg-green-600 text-white px-8 py-3 rounded-lg text-xl font-bold hover:bg-green-700 transition">
                再来一局
              </button>
            )}
          </div>
        )}
      </div>
      
      <div className="mt-4 text-gray-400 text-sm text-center">
        <p>操作说明: A/D 左右移动，W 跳跃（长按跳得更高）</p>
        <p>砖块: 摩擦力大 | 冰块: 摩擦力小 | 岩浆: 触碰死亡 | 金币: 额外加分 | 炸弹: 炸毁方块</p>
      </div>
    </div>
  );
}
