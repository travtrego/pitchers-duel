# Pitcher's Duel

A baseball career game where you only ever pitch. The hitter is always the
computer, and the whole game is the argument you have with him: what you throw,
where you put it, and what he thinks is coming.

```bash
npm install
npm run dev      # play at localhost:5173
npm test         # engine + career tests
npm run build
```

## The game

**Career mode** is the heart of it. You build a pitcher — archetype, handedness,
three starting pitches from a catalog of eighteen — and start the story at your
parents' kitchen table with a college letter and a pro contract in front of you.

- **Go to college** and pick from three programs, each with a real perk
  (coaching XP, draft exposure, cheaper pitch development). Three seasons, then
  draft day.
- **Sign the contract** and get thrown into Double-A at eighteen.

Either way you climb: AA → AAA → the Federal Baseball League, an invented
eight-team league (New York Sentinels, Boston Harbormen, Chicago Bluecaps...).
Every name in the game is fictional — real cities, invented identities.

Written story beats fire at the moments that matter: your first start, a rough
patch that lands you in the coach's office, the midnight phone call, your debut
in the show. Choices shape your ratings and your reputation.

Between starts you spend XP earned on the mound: train ratings, sharpen the
pitches you have, learn new ones. Your club plays four games between each of
your starts, so there is a real pennant race around you — the hub tells you how
many back you are and how many starts are left to do something about it.

**Reputation** runs on two axes. The clubhouse cares whether you are easy to be
around; the fans and front office care whether you are worth the ticket. How you
answer a coach in a slump or a reporter after a gem moves both, and they feed
back into your draft stock, how fast you develop, and how long a leash you get.

**Saves** live in the browser, so the League tab also gives you a save code:
copy it somewhere safe and paste it into any other browser to carry the career
across devices.

**Exhibition mode** is a quick three-inning outing with a stock arsenal.

## How a start plays

Broadcast presentation: camera behind the mound, score bug, lower-third result
banners, a velocity readout on every pitch.

Each pitch is three decisions and one execution:

1. **Call your pitch** (number keys).
2. **Pick your spot** on the zone overlay. The outer ring is off the plate,
   where you go hunting for a chase.
3. **Work the meter** (click or `Space`, three times): start the delivery, stop
   at the top for power, stop on the line for location.

Then the ball actually flies — shrinking away from you toward the plate along
its real break path. The first stretch of flight follows the no-break line and
the break arrives late, which is exactly how tunneling works: ghost trails of
your recent pitches stay on screen, so you can watch a changeup ride the same
early line as the fastballs that set it up.

You pitch full innings; your team's offense is simmed between frames. At each
inning break you choose: head back out, or hand it to the pen. Leave with a
lead your bullpen holds (after five full innings) and the win is yours.

## Why the hitter is the whole game

Before every pitch the batter builds a *guess* — a weighted expectation over
your actual arsenal plus a lean toward part of the plate. Five things move it,
all controlled by you:

- **Sequencing memory.** Every pitch raises his weight on that pitch, recent
  ones counting most. Throw three straight sliders and the fourth is batting
  practice.
- **Count leverage.** He hunts hard stuff at 3-0 and covers spin with two
  strikes.
- **Tunneling.** Pitches are grouped by what they look like out of the hand.
  Fastballs and every fastball-disguised offspeed pitch (change, splitter,
  forkball...) share a tunnel; a splitter behind heaters is devastating, a
  curve behind those same heaters is just a different pitch. The knuckleball is
  its own tunnel: nothing to read, including by you — its break re-rolls every
  throw.
- **Location memory.** He tracks where you've been living and leans that way.
- **Times through the order.** Every hitter keeps his own book on you across the
  whole game. The more of you he has seen, the better he recalls earlier at-bats,
  the less your deception is worth, the fewer bats you miss, and the harder he
  squares you up. The third time through is the hardest part of a start — the
  batter card shows which look he is on and how warm he is. The knuckleball is
  exempt, because there is nothing to learn about it.

## Leverage

Runners on base do not change the strike zone, but they change everything about
how it feels to throw into it. Runners, the inning, the score and the out count
feed one pressure term that narrows the meter's forgiving window, quickens the
bar, and charges extra stamina per pitch — so a long jam in the sixth costs more
arm than a 1-2-3 inning of the same length. Hitters get more aggressive with men
in scoring position.

Composure is the only rating that fights it: a 99-composure arm feels well under
half of what a 25 feels in the same bases-loaded spot.

## Execution and fatigue

The three-stop meter has two independent failure modes: missing the power stop
hangs a breaking ball back over the middle (a four-seam can't hang — no break
to lose), while missing the accuracy stop sprays the pitch to the side you
stopped on. Stamina drains per pitch — faster for low-stamina arms — widening
misses and narrowing both meter windows, so pitch economy is a real currency.
Corners are harder to hit than the middle, which is the actual trade in
pitching.

## Layout

```
src/engine/        pure TypeScript, no React — fully testable
  pitchCatalog.ts  all 18 pitches with tunnel groups
  player.ts        create-a-pitcher: archetypes, ratings, grades, XP economy
  opponents.ts     lineup generation by level of ball
  batterAI.ts      the guess model, deception, swing decisions
  pressure.ts      leverage, and how much of it a pitcher feels
  resolve.ts       execution, whiffs, contact
  game.ts          inning state machine and base running
src/career/        career mode, also engine-pure
  teams.ts         invented colleges and the Federal Baseball League
  story.ts         story beats as serializable data
  career.ts        the fork, seasons, draft, promotion, saves, save codes
  sim.ts           run support, bullpen, pitcher decisions, XP
  standings.ts     the pennant race around your starts
  reputation.ts    clubhouse and fame, and what they buy
src/ui/            React + one canvas
  Stage.tsx        the broadcast camera, ball flight, swings, balls in play
  sound.ts         synthesized audio — no assets
  meterMath.ts     the meter's motion, split out so its timing edges are tested
  GameDay.tsx      a full start, inning by inning
  screens/         menu, create-a-pitcher, hub, story player
```

The engine never imports React and never mutates state; careers save to
localStorage as plain JSON after every change, and old saves are migrated
forward rather than dropped.

It plays on a phone: the stage measures itself, the arsenal becomes a two-column
rail of thumb-sized buttons, and the meter grows a bigger target.

## Coordinates

`x` is screen-right from behind the mound (glove side for a right-hander), `y`
is up, one unit is about 5.7 inches. The strike zone is `|x| < 1.5` and
`|y| < 1.5` — the middle 3×3 of the aiming grid. A lefty's arm-side break
mirrors automatically.
