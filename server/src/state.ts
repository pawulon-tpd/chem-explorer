import { defineTypes, MapSchema, Schema } from '@colyseus/schema';

// Fields are declared (not initialised) so class-field semantics don't shadow
// the accessors that defineTypes installs; values are set in the constructor.
export class Player extends Schema {
  declare name: string;
  declare cls: string;
  declare tunic: number;
  declare skin: number;
  declare hair: number;
  declare x: number;
  declare y: number;
  declare dir: number;
  /** id of the compound this player is studying, '' when none */
  declare reading: string;

  constructor() {
    super();
    Object.assign(this, { name: '', cls: 'wizard', tunic: 0, skin: 0, hair: 0, x: 0, y: 0, dir: 0, reading: '' });
  }
}
defineTypes(Player, {
  name: 'string',
  cls: 'string',
  tunic: 'uint8',
  skin: 'uint8',
  hair: 'uint8',
  x: 'uint8',
  y: 'uint8',
  dir: 'uint8',
  reading: 'string',
});

export class WorldState extends Schema {
  declare players: MapSchema<Player>;

  constructor() {
    super();
    this.players = new MapSchema<Player>();
  }
}
defineTypes(WorldState, { players: { map: Player } });
