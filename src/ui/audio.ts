export type SoundName = 'button01a' | 'button02a' | 'button05' | 'button06';

const SOUND_FILES: Record<SoundName, string> = {
  button01a: 'SE/button01a.mp3',
  button02a: 'SE/button02a.mp3',
  button05: 'SE/button05.mp3',
  button06: 'SE/button06.mp3',
};

const players: Partial<Record<SoundName, HTMLAudioElement>> = {};

function getPlayer(name: SoundName): HTMLAudioElement {
  let player = players[name];
  if (!player) {
    player = new Audio(SOUND_FILES[name]);
    players[name] = player;
  }
  return player;
}

export function playSound(name: SoundName, volume = 0.4): void {
  const soundToggle = document.getElementById('turn-sound') as HTMLInputElement | null;
  if (!soundToggle?.checked) return;
  const player = getPlayer(name);
  player.volume = volume;
  void player.play().catch(() => {});
}
