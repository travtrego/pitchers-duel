import { useEffect, useMemo, useRef } from 'react';
import type { Batter, Loc } from '../engine/types';
import { cellCenter } from '../engine/zone';

/**
 * The broadcast stage: camera behind the mound, plate out ahead, the ball
 * shrinking away from you along its actual break path.
 *
 * The flight model is the same trick real tunneling is: for the first stretch
 * the ball travels toward where it would land with no break, and the break
 * arrives late (s^2.2). Two pitches aimed off the same look separate only in
 * the last fifteen feet — and because ghost trails of recent pitches stay on
 * screen, you can see your sequences working (or telegraphed).
 *
 * Contact continues the shot: the ball leaves the bat and plays out its
 * trajectory — a grounder skipping up the middle, a fly hanging toward the
 * stands, a homer clearing them — while the batter swings through.
 */

export type ExitKind = 'ground' | 'line' | 'fly' | 'popup' | 'foul' | 'hr' | null;

export interface Flight {
  /** Where the ball ends up, zone units. */
  actual: Loc;
  /** The break the ball actually took. */
  liveBreak: Loc;
  velo: number;
  color: string;
  hung: boolean;
  /** Whether the hitter offers — drives the swing animation. */
  swing: boolean;
  /** Ball-off-the-bat animation after arrival, when there was contact. */
  exit: ExitKind;
}

export interface GhostTrail {
  actual: Loc;
  liveBreak: Loc;
  color: string;
}

interface Props {
  width?: number;
  height?: number;
  /** Pitcher handedness, for release point side. */
  throws: 'R' | 'L';
  batter: Batter;
  /** Current flight to animate; null shows the empty scene. */
  flight: Flight | null;
  /** Fired once when the animated ball reaches the plate. */
  onArrive?: () => void;
  ghosts: GhostTrail[];
  /** Aiming overlay: current aim cell and click handler. Hidden when null. */
  aim: Loc | null;
  onAim?: (loc: Loc) => void;
  aimEnabled: boolean;
}

/** Perceived flight time, slowed from reality for readability. */
function flightMs(velo: number): number {
  return (56 / Math.max(50, velo)) * 1000;
}

function exitMs(kind: ExitKind): number {
  if (!kind) return 0;
  return kind === 'hr' ? 1050 : kind === 'popup' ? 900 : kind === 'ground' ? 650 : 750;
}

export function Stage({
  width = 660,
  height = 540,
  throws,
  batter,
  flight,
  onArrive,
  ghosts,
  aim,
  onAim,
  aimEnabled,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arriveRef = useRef(onArrive);
  arriveRef.current = onArrive;

  // The arrival callback mutates game state — new batter, a new ghost trail —
  // which would otherwise re-run the animation effect and restart the pitch
  // mid-flight. Both are read through refs and snapshotted when a pitch
  // starts, so a throw always animates exactly once, start to finish.
  const ghostsRef = useRef(ghosts);
  ghostsRef.current = ghosts;
  const batterRef = useRef(batter);
  batterRef.current = batter;

  const geom = useMemo(() => makeGeometry(width, height, throws), [width, height, throws]);

  // Idle scene: no pitch in the air.
  useEffect(() => {
    if (flight) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    drawField(ctx, geom);
    for (const g of ghosts) drawGhost(ctx, geom, g);
    drawZone(ctx, geom);
    drawPlateAndCatcher(ctx, geom);
    drawBatter(ctx, geom, batter, 0);
  }, [flight, ghosts, geom, batter]);

  // A pitch in flight, and its ball off the bat.
  useEffect(() => {
    if (!flight) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let start = 0;
    let arrived = false;

    // Freeze the scene as it stood when this pitch left the hand.
    const sceneGhosts = ghostsRef.current;
    const sceneBatter = batterRef.current;

    interface BallFrame {
      x: number;
      y: number;
      r: number;
      trail: [number, number][];
    }

    const drawScene = (ball: BallFrame | null, batPose: number) => {
      drawField(ctx, geom);
      for (const g of sceneGhosts) drawGhost(ctx, geom, g);
      drawZone(ctx, geom);
      drawPlateAndCatcher(ctx, geom);
      drawBatter(ctx, geom, sceneBatter, batPose);
      if (ball) {
        ctx.save();
        ctx.strokeStyle = flight.color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ball.trail.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.stroke();
        ctx.restore();

        const grad = ctx.createRadialGradient(
          ball.x - ball.r * 0.3,
          ball.y - ball.r * 0.3,
          ball.r * 0.2,
          ball.x,
          ball.y,
          ball.r,
        );
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, '#c8ccd4');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, Math.max(1, ball.r), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = flight.hung ? '#ffd166' : 'rgba(0,0,0,0.35)';
        ctx.lineWidth = flight.hung ? 2 : 1;
        ctx.stroke();
      }
    };

    const inMs = flightMs(flight.velo);
    const outMs = exitMs(flight.exit);
    const trail: [number, number][] = [];
    const contact = { x: 0, y: 0 };

    const tick = (now: number) => {
      if (!start) start = now;
      const t = now - start;

      if (t <= inMs) {
        // Inbound: ball from hand to plate; hitter loads, then swings late.
        const s = Math.min(1, t / inMs);
        const pos = flightPoint(geom, flight, s);
        trail.push([pos.x, pos.y]);
        drawScene({ ...pos, trail }, batPoseAt(flight.swing, s));
        contact.x = pos.x;
        contact.y = pos.y;
        raf = requestAnimationFrame(tick);
        return;
      }

      if (!arrived) {
        arrived = true;
        arriveRef.current?.();
      }

      if (flight.exit && t <= inMs + outMs) {
        // Outbound: ball off the bat. Trail resets — it's a new journey.
        const s = Math.min(1, (t - inMs) / outMs);
        const pos = exitPoint(geom, flight.exit, contact, s, batter.hand);
        drawScene({ ...pos, trail: [] }, 2.4);
        raf = requestAnimationFrame(tick);
        return;
      }

      // Done: hold the scene, ball gone, bat follow-through if he swung.
      drawScene(null, flight.swing ? 2.4 : 0);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [flight, ghosts, geom, batter]);

  // Aiming overlay: a 5x5 grid of invisible buttons over the zone area.
  const cells = [];
  if (aimEnabled) {
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const c = cellCenter(col, row);
        const p = geom.zoneToScreen(c.x, c.y);
        const inZone = Math.abs(c.x) < 1.5 && Math.abs(c.y) < 1.5;
        const selected = aim && aim.x === c.x && aim.y === c.y;
        cells.push(
          <button
            key={`${row}-${col}`}
            className={[
              'stage-cell',
              inZone ? 'stage-cell-zone' : 'stage-cell-chase',
              selected ? 'stage-cell-selected' : '',
            ].join(' ')}
            style={{
              left: p.x - geom.unit / 2,
              top: p.y - geom.unit / 2,
              width: geom.unit,
              height: geom.unit,
            }}
            onClick={() => onAim?.(c)}
            aria-label={`Aim ${inZone ? 'in zone' : 'off the plate'} row ${row + 1} col ${col + 1}`}
          />,
        );
      }
    }
  }

  return (
    <div className="stage" style={{ width, height }}>
      <canvas ref={canvasRef} width={width} height={height} />
      {cells}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface Geometry {
  w: number;
  h: number;
  /** Pixels per zone unit at plate depth. */
  unit: number;
  zoneCx: number;
  zoneCy: number;
  release: { x: number; y: number };
  zoneToScreen(x: number, y: number): { x: number; y: number };
}

function makeGeometry(w: number, h: number, throws: 'R' | 'L'): Geometry {
  const unit = w * 0.062;
  const zoneCx = w / 2;
  const zoneCy = h * 0.42;
  return {
    w,
    h,
    unit,
    zoneCx,
    zoneCy,
    // From behind the mound a right-hander's hand comes from screen right.
    release: { x: w / 2 + (throws === 'R' ? 34 : -34), y: h * 0.8 },
    zoneToScreen(x: number, y: number) {
      return { x: zoneCx + x * unit, y: zoneCy - y * unit };
    },
  };
}

/** Position and size of the ball at inbound flight fraction s. */
function flightPoint(g: Geometry, f: Flight, s: number): { x: number; y: number; r: number } {
  const target = g.zoneToScreen(f.actual.x, f.actual.y);
  // Where the pitch "pretends" to be going before the break shows up.
  const naive = g.zoneToScreen(f.actual.x - f.liveBreak.x * 0.85, f.actual.y - f.liveBreak.y * 0.85);
  const late = Math.pow(s, 2.2);
  const x = g.release.x + (naive.x - g.release.x) * s + (target.x - naive.x) * late;
  const y = g.release.y + (naive.y - g.release.y) * s + (target.y - naive.y) * late;
  return { x, y, r: 13 - 8.5 * s };
}

/**
 * Ball off the bat. Outbound means away from the camera: up-screen, shrinking.
 * Each trajectory has its own shape; the horizontal drift leans slightly to
 * the pull side of whoever hit it.
 */
function exitPoint(
  g: Geometry,
  kind: Exclude<ExitKind, null>,
  from: { x: number; y: number },
  s: number,
  hand: 'R' | 'L',
): { x: number; y: number; r: number } {
  const { w, h } = g;
  // From behind the mound the pitcher's right hand points toward third base,
  // so left field is screen right. A righty pulls there; a lefty pulls the
  // other way, to the first-base side.
  const pull = hand === 'R' ? 1 : -1;
  const ease = 1 - Math.pow(1 - s, 2);

  switch (kind) {
    case 'hr': {
      const x = from.x + pull * w * 0.16 * ease;
      const rise = Math.sin(Math.min(1, s * 1.15) * Math.PI);
      const y = from.y + (h * 0.1 - from.y) * ease - rise * h * 0.22;
      return { x, y, r: 4.5 - 3.5 * s };
    }
    case 'fly': {
      const x = from.x + pull * w * 0.1 * ease;
      const rise = Math.sin(s * Math.PI);
      const y = from.y + (h * 0.3 - from.y) * ease - rise * h * 0.16;
      return { x, y, r: 4.5 - 3 * s };
    }
    case 'line': {
      const x = from.x + pull * w * 0.09 * ease;
      const y = from.y + (h * 0.33 - from.y) * ease - Math.sin(s * Math.PI) * h * 0.03;
      return { x, y, r: 4.5 - 3 * s };
    }
    case 'ground': {
      const x = from.x + pull * w * 0.07 * ease;
      // Skips: quick decaying bounces along the infield as it runs away.
      const bounce = Math.abs(Math.sin(s * Math.PI * 3)) * (1 - s) * h * 0.035;
      const y = from.y + (h * 0.42 - from.y) * ease - bounce;
      return { x, y, r: 4.5 - 2.6 * s };
    }
    case 'popup': {
      // Straight up over the plate, hangs, comes back down.
      const upDown = Math.sin(s * Math.PI);
      const y = from.y - upDown * h * 0.34;
      return { x: from.x + pull * w * 0.015 * s, y, r: 4.5 - 1.6 * upDown };
    }
    case 'foul': {
      // Sliced backward past the camera — it grows as it gets closer. The side
      // comes from where contact happened so the whole arc stays coherent.
      const side = from.x >= w / 2 ? 1 : -1;
      const x = from.x + side * w * 0.4 * ease + pull * w * 0.05;
      const y = from.y + h * 0.3 * ease;
      return { x, y, r: 4.5 + 7 * s };
    }
  }
}

/** Bat angle through the load and swing, keyed to inbound flight fraction. */
function batPoseAt(swing: boolean, s: number): number {
  if (!swing) return 0;
  // Load back slowly, then explode through the zone in the last fifth.
  if (s < 0.55) return -(s / 0.55) * 0.5;
  if (s < 0.8) return -0.5;
  return -0.5 + ((s - 0.8) / 0.2) * 2.9;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function drawGhost(ctx: CanvasRenderingContext2D, g: Geometry, ghost: GhostTrail) {
  ctx.save();
  ctx.strokeStyle = ghost.color;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const p = flightPoint(
      g,
      { ...ghost, velo: 90, color: ghost.color, hung: false, swing: false, exit: null },
      i / 24,
    );
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  const end = g.zoneToScreen(ghost.actual.x, ghost.actual.y);
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = ghost.color;
  ctx.beginPath();
  ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawZone(ctx: CanvasRenderingContext2D, g: Geometry) {
  const tl = g.zoneToScreen(-1.5, 1.5);
  const size = 3 * g.unit;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(tl.x + (size / 3) * i, tl.y);
    ctx.lineTo(tl.x + (size / 3) * i, tl.y + size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y + (size / 3) * i);
    ctx.lineTo(tl.x + size, tl.y + (size / 3) * i);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(tl.x, tl.y, size, size);
  ctx.restore();
}

function drawField(ctx: CanvasRenderingContext2D, g: Geometry) {
  const { w, h } = g;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0b0e14');
  sky.addColorStop(0.42, '#131a26');
  sky.addColorStop(0.55, '#18222f');
  sky.addColorStop(1, '#1d2a1f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#0e1420';
  ctx.fillRect(0, h * 0.3, w, h * 0.09);
  ctx.fillStyle = '#111927';
  ctx.fillRect(0, h * 0.39, w, h * 0.07);

  ctx.fillStyle = '#22331f';
  ctx.fillRect(0, h * 0.52, w, h * 0.48);
  const dirt = ctx.createRadialGradient(w / 2, h * 0.66, 20, w / 2, h * 0.66, w * 0.42);
  dirt.addColorStop(0, '#4a3826');
  dirt.addColorStop(1, 'rgba(74,56,38,0)');
  ctx.fillStyle = dirt;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);
}

function drawPlateAndCatcher(ctx: CanvasRenderingContext2D, g: Geometry) {
  const { w, h } = g;
  // Home plate, mostly hidden behind the catcher the way it really is.
  const plateY = h * 0.648;
  ctx.fillStyle = '#c9c9c2';
  ctx.beginPath();
  ctx.moveTo(w / 2 - g.unit * 0.72, plateY);
  ctx.lineTo(w / 2 + g.unit * 0.72, plateY);
  ctx.lineTo(w / 2 + g.unit * 0.5, plateY + 8);
  ctx.lineTo(w / 2, plateY + 13);
  ctx.lineTo(w / 2 - g.unit * 0.5, plateY + 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(10,12,18,0.82)';
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.695, 30, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.652, 9, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Batter silhouette with a live bat. Pose is the bat's swing progress:
 * negative = loading back, 0 = set, rising through ~2.4 = swung through.
 */
function drawBatter(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  batter: Batter,
  pose: number,
) {
  const { w, h } = g;
  // Righties set up on the third-base side — screen right from the mound.
  const side = batter.hand === 'R' ? 1 : -1;
  const bx = w / 2 + side * g.unit * 3.4;
  const by = h * 0.63;

  ctx.save();
  ctx.fillStyle = 'rgba(8,10,14,0.88)';
  // Torso leans into the swing slightly.
  const lean = Math.max(0, pose) * 2.2;
  ctx.fillRect(bx - 9 - side * lean, by - 46, 20, 62);
  ctx.beginPath();
  ctx.arc(bx + 1 - side * lean, by - 56, 10, 0, Math.PI * 2);
  ctx.fill();

  // The bat: pivots at the hands. Set position points up-and-back; the swing
  // sweeps it flat through the zone toward the pitcher.
  const handsX = bx + side * 6 - side * lean;
  const handsY = by - 48;
  const setAngle = side === 1 ? -1.15 : Math.PI + 1.15;
  const angle = setAngle - side * pose;
  const len = 30;
  ctx.strokeStyle = 'rgba(8,10,14,0.88)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(handsX, handsY);
  ctx.lineTo(handsX + Math.cos(angle) * len, handsY + Math.sin(angle) * len);
  ctx.stroke();
  ctx.restore();
}
