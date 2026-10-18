/** Bounded display only. It never asks for physical keys or schedules work. */
export function createSyntheticGuidance(progress: (text: string) => void) {
  let action = '', subject = '', deadline = 0, lastSecond = -1;
  const refresh = (now: number) => {
    if (!action) return;
    const second = Math.max(0, Math.ceil((deadline - now) / 1000));
    if (second !== lastSecond) { lastSecond = second; progress(`Driver automat ${subject}: ${action}, limită ${second}s; nu apăsa taste. isTrusted=false.`); }
  };
  return {
    begin(next: string, classId: string, end: number, now: number) { action=next;subject=classId;deadline=end;lastSecond=-1;refresh(now); },
    refresh,
    repeatObserved() {},
    stop(_text: string) { action=''; progress('Etapă diagnostic automată încheiată; fără acceptare fizică.'); },
  };
}
