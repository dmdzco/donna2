import { useRef, useEffect, useCallback } from 'react';
import './ScrollTimePicker.css';

interface Props {
  value: string; // "HH:MM" 24h format
  onChange: (value: string) => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);           // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);         // 0,5,...55
const PERIODS = ['AM', 'PM'] as const;

const ITEM_H = 40; // px, must match .scroll-item height in CSS
const VISIBLE = 4; // items visible above/below center = total visible ~2*VISIBLE+1

export default function ScrollTimePicker({ value, onChange }: Props) {
  const [h24, min] = value.split(':').map(Number);
  const h12 = h24 % 12 || 12;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const minIdx = Math.round(min / 5) % 12;

  const hourRef = useRef<HTMLDivElement>(null!);
  const minRef = useRef<HTMLDivElement>(null!);
  const periodRef = useRef<HTMLDivElement>(null!);

  // Scroll a column so the selected index is centered
  const scrollToIdx = useCallback((el: HTMLDivElement | null, idx: number, smooth = false) => {
    if (!el) return;
    const top = idx * ITEM_H; // padding items shift everything by VISIBLE * ITEM_H, but our padding is built-in
    el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // On mount + when value changes externally, snap columns into place
  useEffect(() => {
    scrollToIdx(hourRef.current, HOURS.indexOf(h12));
    scrollToIdx(minRef.current, minIdx);
    scrollToIdx(periodRef.current, PERIODS.indexOf(period));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build a 24h time string from 12h parts
  const buildTime = useCallback((hour12: number, minute: number, ampm: string) => {
    let h = hour12;
    if (ampm === 'AM' && h === 12) h = 0;
    else if (ampm === 'PM' && h !== 12) h += 12;
    return `${h.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }, []);

  const handleScroll = useCallback((col: 'hour' | 'minute' | 'period') => {
    const refMap = { hour: hourRef, minute: minRef, period: periodRef };
    const el = refMap[col].current;
    if (!el) return;

    const idx = Math.round(el.scrollTop / ITEM_H);

    let newH12 = h12;
    let newMin = MINUTES[minIdx];
    let newPeriod = period;

    if (col === 'hour') newH12 = HOURS[Math.min(idx, HOURS.length - 1)];
    else if (col === 'minute') newMin = MINUTES[Math.min(idx, MINUTES.length - 1)];
    else newPeriod = PERIODS[Math.min(idx, PERIODS.length - 1)];

    const next = buildTime(newH12, newMin, newPeriod);
    if (next !== value) onChange(next);
  }, [h12, minIdx, period, value, onChange, buildTime]);

  const renderColumn = (
    items: (string | number)[],
    selectedIdx: number,
    ref: React.RefObject<HTMLDivElement>,
    col: 'hour' | 'minute' | 'period'
  ) => {
    // Add padding items so the first/last real item can be centered
    const padTop = VISIBLE;
    const padBottom = VISIBLE;

    return (
      <div className="scroll-col">
        <div
          className="scroll-col-inner"
          ref={ref}
          onScroll={() => handleScroll(col)}
        >
          {/* top padding */}
          {Array.from({ length: padTop }, (_, i) => (
            <div key={`pt-${i}`} className="scroll-item" style={{ visibility: 'hidden' }} />
          ))}

          {items.map((item, i) => {
            const dist = Math.abs(i - selectedIdx);
            const cls = dist === 0 ? 'selected' : dist === 1 ? 'near' : '';
            const label = typeof item === 'number' && col === 'minute'
              ? item.toString().padStart(2, '0')
              : String(item);
            return (
              <div
                key={item}
                className={`scroll-item ${cls}`}
                onClick={() => {
                  const el = ref.current;
                  if (el) el.scrollTo({ top: i * ITEM_H, behavior: 'smooth' });
                }}
              >
                {label}
              </div>
            );
          })}

          {/* bottom padding */}
          {Array.from({ length: padBottom }, (_, i) => (
            <div key={`pb-${i}`} className="scroll-item" style={{ visibility: 'hidden' }} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="scroll-time-picker">
      {renderColumn(HOURS, HOURS.indexOf(h12), hourRef, 'hour')}
      <div className="scroll-time-separator">:</div>
      {renderColumn(MINUTES as unknown as number[], minIdx, minRef, 'minute')}
      {renderColumn([...PERIODS], PERIODS.indexOf(period), periodRef, 'period')}
    </div>
  );
}
