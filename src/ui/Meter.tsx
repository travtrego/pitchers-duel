import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeterResult, PitchType } from '../engine/types';
import {
  ACC_TARGET,
  accuracyErrorOf,
  accuracyWindow,
  frameDelta,
  meterSpeed,
  powerErrorOf,
  stepAccuracy,
  stepPower,
} from './meterMath';
import { sound } from './sound';

type Phase = 'idle' | 'power' | 'accuracy' | 'done';

interface Props {
  pitch: PitchType;
  /** 0..1. A tired arm makes both windows narrower and the bar quicker. */
  stamina: number;
  /** 0..1 composure-adjusted leverage. Squeezes the window, quickens the bar. */
  pressure?: number;
  onComplete: (result: MeterResult) => void;
}

/**
 * The three-stop pitching meter.
 *
 * Click once to start the bar climbing, again at the top to set power, and a
 * third time as it falls back through the accuracy line. Missing the power stop
 * hangs the pitch; missing the accuracy line sprays it, and which side you miss
 * on decides which way it runs.
 */
export function Meter({ pitch, stamina, pressure = 0, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [value, setValue] = useState(0);
  const [powerStop, setPowerStop] = useState<number | null>(null);

  const phaseRef = useRef(phase);
  const valueRef = useRef(0);
  const dirRef = useRef<1 | -1>(1);
  const powerRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

  phaseRef.current = phase;

  const speed = meterSpeed(pitch.controlDifficulty, stamina, pressure);
  // Fatigue and leverage both shrink the forgiving window.
  const accWindow = accuracyWindow(pitch.accuracyWindow, stamina, pressure);

  const finish = useCallback(
    (rawAccuracy: number) => {
      setPhase('done');
      onComplete({
        powerError: powerErrorOf(powerRef.current),
        accuracyError: accuracyErrorOf(rawAccuracy, accWindow),
      });
    },
    [accWindow, onComplete],
  );

  useEffect(() => {
    if (phase !== 'power' && phase !== 'accuracy') return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = frameDelta(now, lastRef.current);
      lastRef.current = now;

      const step =
        phaseRef.current === 'power'
          ? stepPower(valueRef.current, dirRef.current, speed, dt)
          : stepAccuracy(valueRef.current, speed, dt);
      dirRef.current = step.direction;
      valueRef.current = step.value;
      setValue(step.value);

      if (step.bottomedOut) {
        // Rode it all the way back down without stopping it.
        if (phaseRef.current === 'power') powerRef.current = 0;
        finish(0);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, speed, finish]);

  const press = useCallback(() => {
    sound.click();
    if (phaseRef.current === 'idle') {
      valueRef.current = 0;
      dirRef.current = 1;
      setValue(0);
      setPhase('power');
    } else if (phaseRef.current === 'power') {
      powerRef.current = valueRef.current;
      setPowerStop(valueRef.current);
      dirRef.current = -1;
      setPhase('accuracy');
    } else if (phaseRef.current === 'accuracy') {
      finish(valueRef.current);
    }
  }, [finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        press();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const label =
    phase === 'idle'
      ? pressure > 0.18
        ? 'From the stretch — smaller window. Click or Space to start.'
        : 'Click or press Space to start your delivery'
      : phase === 'power'
        ? 'Stop it at the top for full power'
        : 'Stop it on the line for your spot';

  return (
    <div
      className={`meter ${pressure > 0.18 ? 'meter-pressed' : ''}`}
      onPointerDown={press}
      role="button"
      tabIndex={0}
    >
      <div className="meter-track">
        <div className="meter-fill" style={{ height: `${value}%`, background: pitch.color }} />
        <div
          className="meter-accline"
          style={{
            bottom: `${ACC_TARGET - accWindow * 45}%`,
            height: `${Math.max(1.5, accWindow * 90)}%`,
          }}
        />
        <div className="meter-top" />
        {powerStop !== null && (
          <div className="meter-powermark" style={{ bottom: `${powerStop}%` }} />
        )}
      </div>
      <div className="meter-label">{label}</div>
    </div>
  );
}
