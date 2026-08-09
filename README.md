# Pitcher's Duel

A baseball game where you only ever pitch. The hitter is always the computer, and
the whole game is the argument you have with him: what you throw, where you put
it, and what he thinks is coming.

```bash
npm install
npm run dev      # play at localhost:5173
npm test         # engine tests
npm run build
```

## How you play

Each pitch is three decisions and one execution:

1. **Pick a pitch** (keys `1`–`5`).
2. **Pick a spot** on the 5×5 grid. The middle 3×3 is the strike zone; the outer
   ring is off the plate, where you go hunting for a chase.
3. **Work the meter** (click or `Space`, three times): start the delivery, stop it
   at the top for power, then stop it on the line for your location.

Get through one inning. Three outs and you're done.

## Why the hitter is the whole game

The batter isn't a dice roll with a swing animation. Before every pitch he builds
a *guess* — a weighted expectation over your five pitches plus a lean toward a
part of the plate. Beating him means throwing something outside that guess.

Four things move the guess, and all four are things you control:

- **Sequencing memory.** Every pitch you throw raises his weight on that pitch,
  with the most recent ones counting most and pitches from earlier at-bats
  counting a third as much. Throw three straight sliders and the fourth one is a
  batting-practice fastball to him. This is the mechanic that makes selection a
  skill instead of a menu.
- **Count leverage.** He hunts hard stuff when he's ahead (3-0, 2-0) and starts
  covering spin with two strikes. The same slider is a great idea in one count
  and a wasted pitch in another.
- **Tunneling.** Pitches are grouped by what they look like out of the hand. The
  four-seam, sinker and changeup share a tunnel, so a changeup behind fastballs
  is genuinely deceptive — while a curveball behind those same fastballs is just
  a different pitch, because he reads the shape early. Deception is scored as
  *how wrong he was* × *how well the pitch hid inside what he expected*.
- **Location memory.** He tracks where you've been living and leans that way, so
  working one side of the plate all inning has a cost.

Turn on **Scout view** to see what he's sitting on. Turn it off when you want the
real thing.

## Why execution matters

The three-stop meter creates two independent ways to fail, and they fail
differently:

- **Missing the power stop** leaves the pitch without its break. It drifts back
  over the middle and sits up — a hung curveball, which the engine flags and the
  hitter feasts on. A four-seam can't hang; it has no break to lose.
- **Missing the accuracy stop** sprays the pitch, and *which side you stopped on
  decides which way it runs*. Stop early and it runs one way, late the other.

Both get worse as you tire. Every pitch drains stamina, which widens your misses
and narrows both meter windows, so a 25-pitch inning genuinely costs you
something. Aiming at a corner is also harder to execute than working the middle —
which is the actual trade in real pitching, and the reason to ever throw a strike.

## Layout

```
src/engine/     pure TypeScript, no React — fully testable
  types.ts      shared types and the coordinate system
  pitches.ts    the arsenal, with tunnel groups
  batters.ts    the lineup — four hitters who beat you differently
  zone.ts       strike zone, umpire noise, location quality
  batterAI.ts   the guess model, deception, swing decisions
  resolve.ts    execution, whiffs, contact quality
  game.ts       inning state machine and base running
  engine.test.ts
src/ui/         React components
```

The engine never imports React and never mutates state, so an inning can be
replayed from a seed. Tests cover the pieces that make the game work — that
repeating a pitch raises the hitter's weight on it, that a changeup out-deceives
a curve behind fastballs, that a missed power stop pulls a curveball back over
the plate, and that grooving fastballs down the middle gives up more runs than
working the corners.

## Coordinates

`x` is screen-right (glove side for a right-handed pitcher), `y` is up, one unit
is about 5.7 inches. The strike zone is `|x| < 1.5` and `|y| < 1.5`, which lines
up exactly with the middle 3×3 of the aiming grid.

## Where this could go

- More innings, a full lineup, a pitch-count limit and a hook
- Hitters who carry their read across at-bats within a game
- Arsenal building between outings — add a cutter, improve changeup command
- A catcher who suggests pitches you can shake off
