import { defineTypes, MapSchema, Schema } from '@colyseus/schema';

export class Gladiator extends Schema {
  declare name: string;
  declare cls: string;
  declare tunic: number;
  declare skin: number;
  declare hair: number;
  declare level: number;
  declare x: number;
  declare y: number;
  declare dir: number;
  declare hp: number;
  declare maxHp: number;
  declare ko: boolean;
  declare kos: number;
  declare falls: number;
  /** epoch ms; synced so clients can draw cooldowns and status effects */
  declare specialReadyAt: number;
  declare shieldUntil: number;
  declare stunUntil: number;
  declare respawnAt: number;

  constructor() {
    super();
    Object.assign(this, {
      name: '', cls: 'wizard', tunic: 0, skin: 0, hair: 0, level: 1, x: 1, y: 1, dir: 0, hp: 100, maxHp: 100,
      ko: false, kos: 0, falls: 0, specialReadyAt: 0, shieldUntil: 0, stunUntil: 0, respawnAt: 0,
    });
  }
}
defineTypes(Gladiator, {
  name: 'string', cls: 'string', tunic: 'uint8', skin: 'uint8', hair: 'uint8', level: 'uint8',
  x: 'uint8', y: 'uint8', dir: 'uint8', hp: 'int16', maxHp: 'int16', ko: 'boolean', kos: 'uint16', falls: 'uint16',
  specialReadyAt: 'float64', shieldUntil: 'float64', stunUntil: 'float64', respawnAt: 'float64',
});

export class Projectile extends Schema {
  /** 'bolt' | 'arrow' | 'note' */
  declare kind: string;
  declare x: number;
  declare y: number;
  declare dir: number;
  declare owner: string;

  constructor() {
    super();
    Object.assign(this, { kind: 'bolt', x: 0, y: 0, dir: 0, owner: '' });
  }
}
defineTypes(Projectile, { kind: 'string', x: 'int8', y: 'int8', dir: 'uint8', owner: 'string' });

export class ArenaState extends Schema {
  declare fighters: MapSchema<Gladiator>;
  declare shots: MapSchema<Projectile>;

  constructor() {
    super();
    this.fighters = new MapSchema<Gladiator>();
    this.shots = new MapSchema<Projectile>();
  }
}
defineTypes(ArenaState, { fighters: { map: Gladiator }, shots: { map: Projectile } });
