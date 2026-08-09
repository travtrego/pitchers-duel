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
 */

export interface Flight {
  /** Where the ball ends up, zone units. */
  actual: Loc;
  /** The break the ball actually took. */
  liveBreak: Loc;
  velo: number;
  color: string;
  hung: boolean;
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

  const geom = useMemo(() => makeGeometry(width, height, throws), [width, height, throws]);

  // Static scene + ghosts redraw whenever inputs change; the flight animation
  // runs its own rAF loop on top.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let start = 0;
    let done = false;

    const drawScene = (ball: { x: number; y: number; r: number; trail: [number, number][] } | null) => {
      drawBackdrop(ctx, geom, batter);
      for (const g of ghosts) drawGhost(ctx, geom, g);
      drawZone(ctx, geom);
      if (ball) {
        // Trail first, ball on top.
        ctx.save();
        ctx.strokeStyle = flight!.color;
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
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = flight!.hung ? '#ffd166' : 'rgba(0,0,0,0.35)';
        ctx.lineWidth = flight!.hung ? 2 : 1;
        ctx.stroke();
      }
    };

    if (!flight) {
      drawScene(null);
      return;
    }

    const ms = flightMs(flight.velo);
    const trail: [number, number][] = [];
    const tick = (now: number) => {
      if (!start) start = now;
      const s = Math.min(1, (now - start) / ms);
      const pos = flightPoint(geom, flight, s);
      trail.push([pos.x, pos.y]);
      drawScene({ ...pos, trail });
      if (s < 1) {
        raf = requestAnimationFrame(tick);
      } else if (!done) {
        done = true;
        arriveRef.current?.();
      }
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
        const p = geom.zoneToScreen(c.x + 0, c.y + 0);
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
// Geometry and drawing
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

/** Position and size of the ball at flight fraction s. */
function flightPoint(g: Geometry, f: Flight, s: number): { x: number; y: number; r: number } {
  const target = g.zoneToScreen(f.actual.x, f.actual.y);
  // Where the pitch "pretends" to be going before the break shows up.
  const naive = g.zoneToScreen(f.actual.x - f.liveBreak.x * 0.85, f.actual.y - f.liveBreak.y * 0.85);
  const late = Math.pow(s, 2.2);
  const x = g.release.x + (naive.x - g.release.x) * s + (target.x - naive.x) * late;
  const y = g.release.y + (naive.y - g.release.y) * s + (target.y - naive.y) * late;
  return { x, y, r: 13 - 8.5 * s };
}

function drawGhost(ctx: CanvasRenderingContext2D, g: Geometry, ghost: GhostTrail) {
  ctx.save();
  ctx.strokeStyle = ghost.color;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const p = flightPoint(g, { ...ghost, velo: 90, color: ghost.color, hung: false }, i / 24);
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
  // Faint interior thirds, like every broadcast K-zone.
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

function drawBackdrop(ctx: CanvasRenderingContext2D, g: Geometry, batter: Batter) {
  const { w, h } = g;
  // Night sky into stadium lights into field.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0b0e14');
  sky.addColorStop(0.42, '#131a26');
  sky.addColorStop(0.55, '#18222f');
  sky.addColorStop(1, '#1d2a1f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Distant stands: banded silhouettes.
  ctx.fillStyle = '#0e1420';
  ctx.fillRect(0, h * 0.3, w, h * 0.09);
  ctx.fillStyle = '#111927';
  ctx.fillRect(0, h * 0.39, w, h * 0.07);

  // Infield grass and dirt around the plate.
  ctx.fillStyle = '#22331f';
  ctx.fillRect(0, h * 0.52, w, h * 0.48);
  const dirt = ctx.createRadialGradient(w / 2, h * 0.66, 20, w / 2, h * 0.66, w * 0.42);
  dirt.addColorStop(0, '#4a3826');
  dirt.addColorStop(1, 'rgba(74,56,38,0)');
  ctx.fillStyle = dirt;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);

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

  // Batter silhouette: righties set up on the third-base side, which from
  // behind the mound is screen right.
  const side = batter.hand === 'R' ? 1 : -1;
  const bx = w / 2 + side * g.unit * 3.4;
  const by = h * 0.63;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,14,0.88)';
  // Legs, torso, head, bat.
  ctx.fillRect(bx - 9, by - 46, 20, 62);
  ctx.beginPath();
  ctx.arc(bx + 1, by - 56, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(8,10,14,0.88)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx + side * 8, by - 50);
  ctx.lineTo(bx + side * 22, by - 78);
  ctx.stroke();
  ctx.restore();

  // Catcher's crouch behind the plate.
  ctx.fillStyle = 'rgba(10,12,18,0.82)';
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.695, 30, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.652, 9, 0, Math.PI * 2);
  ctx.fill();
}
