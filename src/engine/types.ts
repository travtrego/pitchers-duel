/**
 * Coordinate system
 * -----------------
 * The view is from behind the pitcher, looking in at the catcher.
 *   x: positive = screen right = GLOVE side for a RHP
 *   y: positive = up
 * One unit is about 5.7 inches. The strike zone is |x| < 1.5 and |y| < 1.5,
 * which lines up exactly with the middle 3x3 of the 5x5 aiming grid.
 */
export interface Loc {
  x: number;
  y: number;
}

export type TunnelGroup = 'hard' | 'sweep' | 'loop' | 'flutter';

/** Broad family a hitter thinks in when he "sits on" something. */
export type SpeedClass = 'hard' | 'breaking' | 'offspeed';

export interface PitchType {
  id: string;
  name: string;
  abbrev: string;
  /** Nominal velocity in mph at full power. */
  velo: number;
  /** Movement relative to a spinless ball, in zone units. Used for deception, not final location. */
  break: Loc;
  /** 0..1. How much execution error costs you. A curveball punishes a bad meter far more than a heater. */
  controlDifficulty: number;
  /** Half-width (in meter percent) of the perfect-accuracy window. Narrower = harder. */
  accuracyWindow: number;
  /** 0..1 base swing-and-miss quality. */
  whiff: number;
  /** 0..1 ability to draw a chase out of the zone. */
  chase: number;
  /** 0..1 ground ball tendency on contact. */
  gb: number;
  /** Pitches sharing a tunnel look alike out of the hand. */
  tunnel: TunnelGroup;
  speedClass: SpeedClass;
  /** Knuckleball flag: break re-rolls on every throw and nobody commands it. */
  flutter?: boolean;
  color: string;
  blurb: string;
}

export interface Batter {
  id: string;
  name: string;
  hand: 'R' | 'L';
  /** 0..1 ability to square the ball up and avoid whiffs. */
  contact: number;
  /** 0..1 damage on good contact. */
  power: number;
  /** 0..1 resistance to chasing out of the zone. */
  discipline: number;
  /** 0..1 speed, affects infield hits and double plays. */
  speed: number;
  /** 0..1 general willingness to swing. */
  aggression: number;
  /** 0..1 prior lean toward sitting on hard stuff. */
  sitFastball: number;
  blurb: string;
}

export interface PitcherState {
  /** Pitches thrown this outing. */
  pitchCount: number;
  /** 0..1, drains with pitch count. Shrinks meter windows and saps velocity. */
  stamina: number;
}

/** What the player commits to before the meter starts. */
export interface PitchCall {
  pitchId: string;
  aim: Loc;
}

/** The result of the three-stop timing meter. */
export interface MeterResult {
  /** 0..1, 0 = nailed the top of the power stop. Shortfall makes the pitch hang. */
  powerError: number;
  /** -1..1, signed distance from the accuracy line. Sign sets miss direction, magnitude sets miss size. */
  accuracyError: number;
}

export type SwingDecision = 'take' | 'swing';

export type PitchResultKind =
  | 'ball'
  | 'called_strike'
  | 'swinging_strike'
  | 'foul'
  | 'in_play';

export type BattedBallKind =
  | 'groundout'
  | 'flyout'
  | 'lineout'
  | 'popout'
  | 'double_play'
  | 'sac_fly'
  | 'single'
  | 'double'
  | 'triple'
  | 'home_run';

export interface PitchOutcome {
  pitchId: string;
  aim: Loc;
  actual: Loc;
  velo: number;
  inZone: boolean;
  hung: boolean;
  decision: SwingDecision;
  kind: PitchResultKind;
  batted?: BattedBallKind;
  /** 0..1 how well the hitter squared it up, for UI feedback. */
  contactQuality?: number;
  /** 0..1 how badly the hitter was fooled on this pitch. */
  deception: number;
  /** Human-readable line for the pitch log. */
  description: string;
  runsScored: number;
  outsRecorded: number;
}

/** One pitch as the hitter remembers it. */
export interface MemoryEntry {
  pitchId: string;
  loc: Loc;
  /** True if thrown to the batter currently at the plate. */
  thisPlateAppearance: boolean;
}

export interface Guess {
  /** Normalized weights over pitch ids. Sums to 1. */
  typeWeights: Record<string, number>;
  /** Where the hitter is leaning, in zone units. */
  zoneLean: Loc;
  /** 0..1 how ready they are to swing in this count. */
  aggression: number;
  /** Velocity the hitter's timing is geared to. */
  expectedVelo: number;
}

export type Bases = [boolean, boolean, boolean];

export interface GameState {
  /** The pitcher's usable pitches for this outing, already scaled by his ratings. */
  arsenal: PitchType[];
  /** The opposing order this outing. */
  lineup: Batter[];
  /** Stamina drained per pitch; better-conditioned arms drain slower. */
  staminaPerPitch: number;
  inning: number;
  outs: number;
  balls: number;
  strikes: number;
  bases: Bases;
  runs: number;
  hits: number;
  walks: number;
  strikeouts: number;
  batterIndex: number;
  pitcher: PitcherState;
  memory: MemoryEntry[];
  log: PitchOutcome[];
  /** Set once three outs are recorded. */
  inningOver: boolean;
}
