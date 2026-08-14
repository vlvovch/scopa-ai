import { useState } from 'react';
import type { FamilyRoomPlayer } from './multiplayer/types';

interface FamilyWaitingRoomProps {
  roomCode: string;
  maxPlayers: number;
  players: FamilyRoomPlayer[];
  onUpdateNickname: (nickname: string) => void;
  onLeave: () => void;
}

export function FamilyWaitingRoom({ roomCode, maxPlayers, players, onUpdateNickname, onLeave }: FamilyWaitingRoomProps) {
  const [nickname, setNickname] = useState('');
  const shareUrl = `${window.location.origin}/join/${roomCode}`;
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, color: 'var(--color-text-primary)' }}>
      <section style={{ width: 'min(100%, 520px)', padding: 'clamp(20px, 5vw, 40px)', border: '1px solid var(--color-accent)', borderRadius: 12, background: 'rgba(0, 0, 0, 0.22)' }}>
        <h1>Waiting for players</h1>
        <p>Share this room code with your family:</p>
        <strong style={{ fontSize: 'clamp(1.6rem, 8vw, 2.5rem)', letterSpacing: 3 }}>{roomCode}</strong>
        <p style={{ wordBreak: 'break-all', opacity: 0.7 }}>{shareUrl}</p>
        <h2>{players.length} / {maxPlayers} players</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {players.map((player) => <div key={player.id} style={{ padding: 10, borderRadius: 8, background: 'rgba(255, 255, 255, 0.08)' }}>{player.nickname}{player.isSelf ? ' (you)' : ''}</div>)}
        </div>
        <label style={{ display: 'block', marginTop: 20 }}>Change nickname<input value={nickname} onChange={(event) => setNickname(event.target.value)} onBlur={() => { if (nickname.trim()) onUpdateNickname(nickname.trim()); }} maxLength={20} /></label>
        <button style={{ marginTop: 20 }} onClick={onLeave}>Leave room</button>
      </section>
    </main>
  );
}
