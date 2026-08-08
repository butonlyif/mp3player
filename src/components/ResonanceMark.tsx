import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import type { ResonanceLevel } from '../lib/api';
import { nextResonance, RESONANCE_LABELS } from '../library/resonance';

interface ResonanceMarkProps {
  level: ResonanceLevel;
  onChange(level: ResonanceLevel): void;
}

const LEVELS: ResonanceLevel[] = [0, 1, 2, 3];

export default function ResonanceMark({ level, onChange }: ResonanceMarkProps) {
  const stopMouse = (event: MouseEvent) => event.stopPropagation();
  const stopPointer = (event: PointerEvent) => event.stopPropagation();
  const cycle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onChange(nextResonance(level));
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onChange(nextResonance(level));
  };

  return (
    <span
      className="resonance-mark"
      onClick={stopMouse}
      onDoubleClick={stopMouse}
      onPointerDown={stopPointer}
    >
      <button
        type="button"
        className="resonance-mark-main"
        aria-label={`${RESONANCE_LABELS[level]} · 点击修改`}
        title={`${RESONANCE_LABELS[level]} · 点击修改`}
        onClick={cycle}
        onKeyDown={handleKeyDown}
      >
        <span data-testid="resonance-line" className={`resonance-line level-${level}`} />
      </button>
      <span className="resonance-picker" role="group" aria-label="选择私人关系">
        {LEVELS.map((choice) => (
          <button
            key={choice}
            type="button"
            className={`resonance-choice level-${choice} ${choice === level ? 'active' : ''}`}
            aria-label={`设为${RESONANCE_LABELS[choice]}`}
            title={RESONANCE_LABELS[choice]}
            onClick={(event) => {
              event.stopPropagation();
              onChange(choice);
            }}
          >
            <span className={`resonance-line level-${choice}`} />
          </button>
        ))}
      </span>
    </span>
  );
}
