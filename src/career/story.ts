import type { Ratings } from '../engine/player';

/**
 * Story beats. Scenes are data; anything that changes the career state beyond
 * simple stat effects is expressed as an action string that career.ts handles,
 * so scenes stay serializable and the save file stays plain JSON.
 */

export interface SceneLine {
  speaker: string;
  text: string;
}

export interface SceneEffects {
  xp?: number;
  ratings?: Partial<Ratings>;
  flags?: Record<string, string | number | boolean>;
  /** Moves the clubhouse and fame meters. */
  rep?: { clubhouse?: number; fame?: number };
}

export type SceneAction =
  | { type: 'goto-scene'; sceneId: string }
  | { type: 'commit-college'; collegeId: string }
  | { type: 'sign-pro' }
  | { type: 'sign-draft' }
  | { type: 'advance-season' }
  | { type: 'continue' };

export interface SceneChoice {
  label: string;
  /** What the other person says back when you pick it. */
  response?: string;
  effects?: SceneEffects;
  action: SceneAction;
}

export interface Scene {
  id: string;
  title: string;
  /** Location line under the title, broadcast-chyron style. */
  setting: string;
  lines: SceneLine[];
  choices: SceneChoice[];
}

/**
 * Static scenes. Dynamic ones (college offers, draft day, season end) are
 * built in career.ts where the state lives.
 */
export const SCENES: Record<string, Scene> = {
  origin: {
    id: 'origin',
    title: 'The Kitchen Table',
    setting: 'Your parents’ house — June, senior year',
    lines: [
      { speaker: 'NARRATOR', text: 'Two pieces of paper on the table. A stack of college letters, and a minor-league contract with a pen resting on it. The scout has been sitting there for an hour and hasn’t touched his coffee.' },
      { speaker: 'SCOUT', text: 'I’ll be straight with you, kid. The fastball’s real. The rest is a project. Some guys need college. Some guys need to get thrown in the deep end. Nobody knows which one you are — including you.' },
      { speaker: 'MOM', text: 'Whatever you pick, you’re mowing the lawn this weekend either way.' },
    ],
    choices: [
      {
        label: 'Commit to college ball',
        response: '“Smart. Three years of coaching and Friday nights under lights. We’ll be watching — trust me, we never stop watching.”',
        action: { type: 'goto-scene', sceneId: 'college-offers' },
      },
      {
        label: 'Sign the pro contract',
        response: '“Deep end it is. Bus leagues, bad motels, hitters who were in Double-A last week. You’ll grow up fast or not at all. Welcome to professional baseball.”',
        action: { type: 'sign-pro' },
      },
    ],
  },

  'college-arrival': {
    id: 'college-arrival',
    title: 'Move-In Day',
    setting: 'Athletic dorms — August',
    lines: [
      { speaker: 'NARRATOR', text: 'Your roommate is a 240-pound catcher who alphabetized his protein powders. The field is nicer than any you’ve ever thrown on.' },
      { speaker: 'COACH', text: 'Fall ball starts Monday. I don’t care what you were in high school — everyone here was that. Show me you can throw strike one, and we’ll get along fine.' },
    ],
    choices: [
      { label: 'Get to work', effects: { xp: 30 }, action: { type: 'continue' } },
    ],
  },

  'pro-arrival': {
    id: 'pro-arrival',
    title: 'The Deep End',
    setting: 'Double-A clubhouse — April',
    lines: [
      { speaker: 'NARRATOR', text: 'The clubhouse smells like liniment and losing streaks. Half these guys are older than your high-school coach was. Your locker has your name on masking tape.' },
      { speaker: 'VETERAN', text: 'Eighteen, huh? I got breaking balls older than you. Listen — the hitters here don’t chase like high schoolers. You’ll have to actually pitch. Ask me anything except my ERA.' },
    ],
    choices: [
      { label: 'Take the locker', effects: { xp: 30 }, action: { type: 'continue' } },
    ],
  },

  'first-start': {
    id: 'first-start',
    title: 'First Start',
    setting: 'Bullpen — twenty minutes to first pitch',
    lines: [
      { speaker: 'COACH', text: 'Warm-ups looked good. Now forget them. Here’s the only scouting report that matters: every hitter up there is guessing. Your whole job is to be wrong to guess about.' },
      { speaker: 'COACH', text: 'How are we attacking tonight?' },
    ],
    choices: [
      {
        label: '“Right at them. Fastballs early.”',
        response: '“Fine by me. Just remember — the third time they see it, it better be somewhere new.”',
        effects: { xp: 15, flags: { approach: 'attack' }, rep: { fame: 3 } },
        action: { type: 'continue' },
      },
      {
        label: '“Keep them guessing from pitch one.”',
        response: '“A kid after my own heart. Don’t get cute in fastball counts, that’s all I ask.”',
        effects: { xp: 15, flags: { approach: 'mix' }, rep: { clubhouse: 3 } },
        action: { type: 'continue' },
      },
    ],
  },

  'rough-patch': {
    id: 'rough-patch',
    title: 'The Office',
    setting: 'Pitching coach’s office — door closed',
    lines: [
      { speaker: 'COACH', text: 'Sit down. Nobody’s yelling. Every pitcher who ever lived has had a month where the ball finds barrels. The question isn’t whether you’re getting hit — it’s what you do Tuesday morning about it.' },
    ],
    choices: [
      {
        label: 'Extra bullpen sessions',
        response: '“Good. Command is a callus. You build it by gripping a baseball until your hand remembers.”',
        effects: { ratings: { command: 2 }, rep: { clubhouse: 4 } },
        action: { type: 'continue' },
      },
      {
        label: 'Live in the film room',
        response: '“Smart. Watch their hands, not the highlights. Hitters tell you what they’re afraid of if you watch long enough.”',
        effects: { ratings: { composure: 2 }, rep: { clubhouse: 3 } },
        action: { type: 'continue' },
      },
      {
        label: '“I’m fine. Ball’s just finding holes.”',
        response: '“...That’s either veteran poise or teenage denial, and I genuinely cannot tell which. Get out of my office.”',
        effects: { xp: 25, flags: { swagger: true }, rep: { clubhouse: -12, fame: 6 } },
        action: { type: 'continue' },
      },
    ],
  },

  gem: {
    id: 'gem',
    title: 'Postgame',
    setting: 'Hallway outside the clubhouse — recorders out',
    lines: [
      { speaker: 'REPORTER', text: 'That’s the best start anyone’s thrown here all year. The sequence you put on their cleanup hitter in the sixth — fastball up, fastball up, and then the floor fell out of that offspeed pitch. Was that planned?' },
    ],
    choices: [
      {
        label: '“I set that up three pitches early.”',
        response: 'She raises an eyebrow, writing. “Eighteen going on Greg-whoever. Nice outing, kid.”',
        effects: { xp: 40, rep: { clubhouse: -6, fame: 14 } },
        action: { type: 'continue' },
      },
      {
        label: '“Honestly? Catcher called it. I just threw it.”',
        response: 'Down the hall, your catcher yells “FINALLY, SOME CREDIT.” The beat writers love you already.',
        effects: { xp: 40, flags: { humble: true }, rep: { clubhouse: 16, fame: 5 } },
        action: { type: 'continue' },
      },
    ],
  },

  'callup-aaa': {
    id: 'callup-aaa',
    title: 'Moving Up',
    setting: 'Manager’s office — season’s end',
    lines: [
      { speaker: 'MANAGER', text: 'Pack light. Triple-A hitters don’t miss the mistake pitch — ever. But the org thinks you’re done learning what this level can teach you. So do I.' },
    ],
    choices: [
      { label: 'Shake his hand', effects: { xp: 50, rep: { fame: 8 } }, action: { type: 'continue' } },
    ],
  },

  'callup-mlb': {
    id: 'callup-mlb',
    title: 'The Call',
    setting: 'Team hotel — 11:40 PM',
    lines: [
      { speaker: 'NARRATOR', text: 'Your phone buzzes. The manager’s name on the screen. Managers do not call at midnight to chat.' },
      { speaker: 'MANAGER', text: 'Hey. Don’t get on the bus tomorrow. You’re flying commercial in the morning — the big club needs a starter this weekend. It’s you.' },
      { speaker: 'NARRATOR', text: 'He hangs up. You sit on the edge of a motel bed in the dark for a long time. Then you call your mom.' },
      { speaker: 'MOM', text: '...I KNEW IT. I’m booking flights. Don’t you dare pitch scared, baby.' },
    ],
    choices: [
      { label: 'Try to sleep. Fail.', effects: { xp: 75, rep: { fame: 18 } }, action: { type: 'continue' } },
    ],
  },

  'mlb-debut': {
    id: 'mlb-debut',
    title: 'Debut',
    setting: 'The tunnel — you can hear the crowd from here',
    lines: [
      { speaker: 'NARRATOR', text: 'The tunnel opens onto more green than you’ve ever seen. Forty thousand people who have no idea who you are. Yet.' },
      { speaker: 'CATCHER', text: 'Kid. Look at me. Same sixty feet six inches it’s been your whole life. Everything else is decoration. Now — what are we starting the first guy with?' },
    ],
    choices: [
      {
        label: '“First pitch, best fastball. Let’s find out.”',
        response: 'He grins behind the mask. “Correct answer. Welcome to the show.”',
        effects: { xp: 25, rep: { fame: 8 } },
        action: { type: 'continue' },
      },
      {
        label: '“Something soft. Let’s be rude about it.”',
        response: 'He laughs out loud. “Cold-blooded. I’m gonna enjoy catching you.”',
        effects: { xp: 25, flags: { swagger: true }, rep: { clubhouse: -4, fame: 12 } },
        action: { type: 'continue' },
      },
    ],
  },

  award: {
    id: 'award',
    title: 'Hardware',
    setting: 'League offices — winter',
    lines: [
      { speaker: 'NARRATOR', text: 'The trophy is heavier than it looks: ACE OF THE YEAR, your name freshly engraved under pitchers you grew up pretending to be.' },
      { speaker: 'COACH', text: 'Enjoy it for exactly one evening. Then remember every hitter in the league just spent their winter watching film of you.' },
    ],
    choices: [
      { label: 'One evening, then', effects: { xp: 100, rep: { fame: 25 } }, action: { type: 'continue' } },
    ],
  },
};
