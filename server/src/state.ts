import { ArraySchema, defineTypes, MapSchema, Schema } from '@colyseus/schema';

// Fields are declared (not initialised) so class-field semantics don't shadow
// the accessors that defineTypes installs; values are set in the constructor.
export class Player extends Schema {
  declare pid: string;
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
  declare xp: number;
  declare level: number;
  /** resolved calls / correct calls: calibration */
  declare calls: number;
  declare correct: number;
  /** hypotheses this player authored that resolved supported / refuted */
  declare supported: number;
  declare refuted: number;

  constructor() {
    super();
    Object.assign(this, {
      pid: '', name: '', cls: 'wizard', tunic: 0, skin: 0, hair: 0, x: 0, y: 0, dir: 0, reading: '',
      xp: 0, level: 1, calls: 0, correct: 0, supported: 0, refuted: 0,
    });
  }
}
defineTypes(Player, {
  pid: 'string',
  name: 'string',
  cls: 'string',
  tunic: 'uint8',
  skin: 'uint8',
  hair: 'uint8',
  x: 'uint8',
  y: 'uint8',
  dir: 'uint8',
  reading: 'string',
  xp: 'uint32',
  level: 'uint8',
  calls: 'uint16',
  correct: 'uint16',
  supported: 'uint16',
  refuted: 'uint16',
});

export class Vote extends Schema {
  declare name: string;
  declare cls: string;
  /** 'for' | 'against' */
  declare choice: string;

  constructor() {
    super();
    Object.assign(this, { name: '', cls: '', choice: 'for' });
  }
}
defineTypes(Vote, { name: 'string', cls: 'string', choice: 'string' });

export class Crystal extends Schema {
  /** untested | queued | synthesising | assaying | tested */
  declare status: string;
  /** epoch ms of the current phase */
  declare startedAt: number;
  declare readyAt: number;
  /** revealed pIC50; -1 while unknown */
  declare pIC50: number;
  /** keyed by player pid */
  declare votes: MapSchema<Vote>;

  constructor() {
    super();
    Object.assign(this, { status: 'untested', startedAt: 0, readyAt: 0, pIC50: -1 });
    this.votes = new MapSchema<Vote>();
  }
}
defineTypes(Crystal, {
  status: 'string',
  startedAt: 'float64',
  readyAt: 'float64',
  pIC50: 'float32',
  votes: { map: Vote },
});

export class StanceVote extends Schema {
  declare name: string;
  declare cls: string;
  /** 'believe' | 'doubt' */
  declare stance: string;

  constructor() {
    super();
    Object.assign(this, { name: '', cls: '', stance: 'believe' });
  }
}
defineTypes(StanceVote, { name: 'string', cls: 'string', stance: 'string' });

/** Evidence note: what a crystal says about the claim (today's "annotation"). */
export class Note extends Schema {
  declare name: string;
  declare cls: string;
  declare text: string;
  declare at: number;

  constructor() {
    super();
    Object.assign(this, { name: '', cls: '', text: '', at: 0 });
  }
}
defineTypes(Note, { name: 'string', cls: 'string', text: 'string', at: 'float64' });

export class Hypothesis extends Schema {
  declare statement: string;
  /** 'hits' | 'misses' | 'beats' */
  declare claim: string;
  declare crystals: ArraySchema<string>;
  declare land: number;
  declare authorPid: string;
  declare authorName: string;
  declare authorCls: string;
  declare createdAt: number;
  /** 'open' | 'supported' | 'refuted' | 'abandoned' */
  declare status: string;
  declare resolvedAt: number;
  /** named crystals revealed since proposal; stances lock once > 0 */
  declare revealed: number;
  declare stances: MapSchema<StanceVote>;
  declare notes: ArraySchema<Note>;

  constructor() {
    super();
    Object.assign(this, {
      statement: '', claim: 'hits', land: 0, authorPid: '', authorName: '', authorCls: '',
      createdAt: 0, status: 'open', resolvedAt: 0, revealed: 0,
    });
    this.crystals = new ArraySchema<string>();
    this.stances = new MapSchema<StanceVote>();
    this.notes = new ArraySchema<Note>();
  }
}
defineTypes(Hypothesis, {
  statement: 'string',
  claim: 'string',
  crystals: ['string'],
  land: 'uint8',
  authorPid: 'string',
  authorName: 'string',
  authorCls: 'string',
  createdAt: 'float64',
  status: 'string',
  resolvedAt: 'float64',
  revealed: 'uint8',
  stances: { map: StanceVote },
  notes: [Note],
});

export class WorldState extends Schema {
  declare players: MapSchema<Player>;
  declare crystals: MapSchema<Crystal>;
  declare hypotheses: MapSchema<Hypothesis>;

  constructor() {
    super();
    this.players = new MapSchema<Player>();
    this.crystals = new MapSchema<Crystal>();
    this.hypotheses = new MapSchema<Hypothesis>();
  }
}
defineTypes(WorldState, { players: { map: Player }, crystals: { map: Crystal }, hypotheses: { map: Hypothesis } });
