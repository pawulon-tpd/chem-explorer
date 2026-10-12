// Arena rules shared by client and server. The arena is a separate realm reached
// through a portal: it is not part of the chemical map, and fighting earns no XP.

/** '#' wall, '.' floor, 'O' pillar, 'B' brazier, 'S' spawn (floor), 'E' exit portal (floor). */
export const ARENA_LAYOUT = [
  '#######################',
  '#S.........B.........S#',
  '#.....O.........O.....#',
  '#.....................#',
  '#..O.....##.##.....O..#',
  '#........#...#........#',
  '#S.......#...#.......S#',
  '#........##.##........#',
  '#..O...............O..#',
  '#.....................#',
  '#.....O.........O.....#',
  '#S.........E.........S#',
  '#######################',
];

export const ARENA_W = ARENA_LAYOUT[0].length;
export const ARENA_H = ARENA_LAYOUT.length;

export function arenaCell(x: number, y: number): string {
  return x < 0 || y < 0 || x >= ARENA_W || y >= ARENA_H ? '#' : ARENA_LAYOUT[y][x];
}

/** Walkable by players (ignores other players). */
export function arenaWalkable(x: number, y: number): boolean {
  const c = arenaCell(x, y);
  return c === '.' || c === 'S' || c === 'E';
}

/** Projectiles fly over floor only. */
export const arenaPassesShot = arenaWalkable;

export const ARENA_SPAWNS: [number, number][] = [];
export let ARENA_EXIT: [number, number] = [0, 0];
ARENA_LAYOUT.forEach((row, y) =>
  [...row].forEach((c, x) => {
    if (c === 'S') ARENA_SPAWNS.push([x, y]);
    if (c === 'E') ARENA_EXIT = [x, y];
  }),
);

export const DIRS: [number, number][] = [[0, 1], [-1, 0], [1, 0], [0, -1]]; // down left right up

export type AttackKind = 'melee' | 'bolt' | 'arrow' | 'note';
export type SpecialKind = 'nova' | 'charge' | 'volley' | 'heal' | 'shield' | 'discord';

export interface Fighter {
  hp: number;
  attack: { kind: AttackKind; dmg: number; cooldown: number; range?: number; stepMs?: number; name: string };
  special: { kind: SpecialKind; cooldown: number; name: string; text: string };
}

export const FIGHTERS: Record<string, Fighter> = {
  wizard: {
    hp: 100,
    attack: { kind: 'bolt', dmg: 14, cooldown: 600, range: 6, stepMs: 70, name: 'Firebolt' },
    special: { kind: 'nova', cooldown: 8000, name: 'Free-energy nova', text: '20 damage to everyone within 2 tiles.' },
  },
  warrior: {
    hp: 115,
    attack: { kind: 'melee', dmg: 18, cooldown: 450, name: 'Sword' },
    special: { kind: 'charge', cooldown: 6000, name: 'Reflux charge', text: 'Dash up to 3 tiles; 22 damage to whoever you crash into.' },
  },
  ranger: {
    hp: 100,
    attack: { kind: 'arrow', dmg: 12, cooldown: 500, range: 8, stepMs: 50, name: 'Arrow' },
    special: { kind: 'volley', cooldown: 7000, name: 'Volley', text: 'Three parallel arrows.' },
  },
  healer: {
    hp: 105,
    attack: { kind: 'melee', dmg: 8, cooldown: 600, name: 'Staff' },
    special: { kind: 'heal', cooldown: 9000, name: 'Purify', text: 'Heal 35 HP.' },
  },
  paladin: {
    hp: 130,
    attack: { kind: 'melee', dmg: 15, cooldown: 700, name: 'Hammer' },
    special: { kind: 'shield', cooldown: 10000, name: 'Shield wall', text: 'Take 70% less damage for 3 s.' },
  },
  bard: {
    hp: 100,
    attack: { kind: 'note', dmg: 10, cooldown: 650, range: 5, stepMs: 70, name: 'Sound wave' },
    special: { kind: 'discord', cooldown: 10000, name: 'Discord', text: 'Stun everyone within 2 tiles for 1.5 s (6 damage).' },
  },
};

export function fighterFor(cls: string): Fighter {
  return FIGHTERS[cls] ?? FIGHTERS.wizard;
}

export const ARENA = {
  novaRadius: 2,
  novaDmg: 20,
  chargeTiles: 3,
  chargeDmg: 22,
  heal: 35,
  shieldMs: 3000,
  shieldFactor: 0.3,
  discordRadius: 2,
  discordDmg: 6,
  stunMs: 1500,
  respawnMs: 3000,
  tickMs: 50,
};
