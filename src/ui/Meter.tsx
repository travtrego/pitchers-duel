import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeterResult, PitchType } from '../engine/types';

/** Where on the bar the accuracy line sits, in bar percent. */
const ACC_TARGET = 18;
/** Bar percent per second at the baseline. */
const BASE_SPEED = 145;

type Phase = 'idle' | 'power' | 'accuracy' | 'done';

interface Props {
  pitch: PitchType;
  /** 0..1. A tired arm makes both windows narrower and the bar quicker. */
  stamina: number;
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
export function Meter({ pitch, stamina, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [value, setValue] = useState(0);
  const [powerStop, setPowerStop] = useState<number | null>(null);

  const phaseRef = useRef(phase);
  const valueRef = useRef(0);
  const dirRef = useRef(1);
  const powerRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

  phaseRef.current = phase;

  const speed = BASE_SPEED * (1 + pitch.controlDifficulty * 0.45) * (1 + (1 - stamina) * 0.3);
  // Fatigue shrinks the forgiving windows on both stops.
  const accWindow = pitch.accuracyWindow * (0.55 + 0.45 * stamina);

  const finish = useCallback(
    (rawAccuracy: number) => {
      const shortfall = powerRef.current === null ? 1 : (100 - powerRef.current) / 100;
      const powerError = Math.max(0, shortfall - 0.05) / 0.95;

      const rawDelta = (rawAccuracy - ACC_TARGET) / 45;
      const beyond = Math.max(0, Math.abs(rawDelta) - accWindow);
      const accuracyError =
        beyond === 0 ? 0 : Math.sign(rawDelta) * Math.min(1, beyond / (1 - accWindow));

      setPhase('done');
      onComplete({ powerError, accuracyError });
    },
    [accWindow, onComplete],
  );

  useEffect(() => {
    if (phase !== 'power' && phase !== 'accuracy') return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      let v = valueRef.current + dirRef.current * speed * dt;

      if (phaseRef.current === 'power') {
        if (v >= 100) {
          v = 100;
          dirRef.current = -1;
        }
        if (v <= 0) {
          // Rode it all the way back down without stopping it: no power at all.
          valueRef.current = 0;
          setValue(0);
          powerRef.current = 0;
          finish(0);
          return;
        }
      } else if (v <= 0) {
        valueRef.current = 0;
        setValue(0);
        finish(0);
        return;
      }

      valueRef.current = v;
      setValue(v);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, speed, finish]);

  const press = useCallback(() => {
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
      ? 'Click or press Space to start your delivery'
      : phase === 'power'
        ? 'Stop it at the top for full power'
        : 'Stop it on the line for your spot';

  return (
    <div className="meter" onPointerDown={press} role="button" tabIndex={0}>
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
