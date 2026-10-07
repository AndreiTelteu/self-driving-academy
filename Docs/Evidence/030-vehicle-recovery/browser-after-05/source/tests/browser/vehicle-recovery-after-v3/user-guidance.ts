export type HumanAction =
  | 'NO_POINT'
  | 'DRIVE'
  | 'RECOVER'
  | 'BLOCKED'
  | 'REPEAT'
  | 'OLD_R'
  | 'NEW_T'
  | 'HUD'
  | 'STALE_HUD'
  | 'AUTO_R'
  | 'NATIVE_FAULT';
export const ACTIONS: Record<HumanAction, string> = {
  NO_POINT:
    'Click în canvas. Apasă și eliberează R o singură dată. Nu există încă un punct sigur; refuzul este rezultatul așteptat.',
  DRIVE:
    'Click în canvas. Ține W împreună cu A sau D până când apare STOP. La STOP eliberează imediat toate tastele.',
  RECOVER:
    'Eliberează toate tastele de condus. Click în canvas; apasă și eliberează R o singură dată pentru mașina răsturnată.',
  BLOCKED:
    'Click în canvas. Apasă și eliberează R o singură dată; cealaltă mașină blochează locul, deci recuperarea trebuie refuzată.',
  REPEAT:
    'Click în canvas. Ține R până apare „Repetarea a fost observată”, apoi eliberează R. Nu apăsa alte taste.',
  OLD_R:
    'Click în canvas. Apasă și eliberează R o dată. Tasta este acum remapată la T; vechiul R trebuie ignorat.',
  NEW_T:
    'Click în canvas. Apasă și eliberează T o dată. Noua tastă trebuie recunoscută, iar locul blocat refuzat.',
  HUD: 'Click o singură dată pe butonul real „Deblochează mașina” din HUD. Nu apăsa R în acest pas.',
  STALE_HUD:
    'În AUTO nu există loc PLAYER. Click o singură dată pe butonul HUD încă vizibil, apoi click în canvas. Așteaptă instrucțiunea următoare înainte să apeși R.',
  AUTO_R:
    'Click în canvas. Apasă și eliberează R o dată. În AUTO nu există loc PLAYER; mașina nu trebuie mutată.',
  NATIVE_FAULT:
    'Click în canvas. Apasă și eliberează R o dată. Proba injectează o eroare nativă; nu încerca din nou și nu apăsa alte taste.',
};
/** Presentation only: exact runtime deadline is passed in, never created or extended here. */
export function createHumanGuidance(write: (text: string) => void) {
  let current: {
    action: HumanAction;
    classId: string;
    deadline: number;
    repeatObserved: boolean;
  } | null = null;
  let lastLabel = '';
  const publish = (text: string) => {
    if (text !== lastLabel) {
      lastLabel = text;
      write(text);
    }
  };
  return {
    begin(action: HumanAction, classId: string, deadline: number, now: number) {
      current = { action, classId, deadline, repeatObserved: false };
      this.refresh(now);
    },
    repeatObserved() {
      if (current?.action === 'REPEAT') current.repeatObserved = true;
    },
    refresh(now: number) {
      if (!current) return;
      const seconds = Math.max(0, Math.ceil((current.deadline - now) / 1000));
      const action = current.repeatObserved
        ? 'Repetarea a fost observată. ELIBEREAZĂ R acum.'
        : ACTIONS[current.action];
      publish(
        `${current.classId} · ${current.action} · ${seconds}s rămase din limita originală de 90s. ${action}`,
      );
    },
    stop(text: string) {
      current = null;
      publish(text);
    },
  };
}
