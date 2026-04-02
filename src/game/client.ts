import Peer, { DataConnection } from 'peerjs';
import { GameState } from './types';

export class GameClient {
  peer: Peer;
  conn: DataConnection | null = null;
  onStateUpdate: (state: GameState) => void;
  myId: string = '';

  constructor(roomCode: string, name: string, onStateUpdate: (state: GameState) => void, onConnect: () => void, onError: (err: any) => void) {
    this.onStateUpdate = onStateUpdate;
    this.peer = new Peer();
    
    this.peer.on('open', id => {
      this.myId = id;
      this.conn = this.peer.connect(`sch-game-2026-${roomCode}`);
      
      this.conn.on('open', () => {
        this.conn!.send({ type: 'JOIN', name });
        onConnect();
      });
      
      this.conn.on('data', (data: any) => {
        if (data.type === 'SYNC') {
          this.onStateUpdate(data.state);
        }
      });
      
      this.conn.on('error', onError);
    });

    this.peer.on('error', onError);
  }

  send(data: any) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  }
}
