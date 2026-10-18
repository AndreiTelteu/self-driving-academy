import assert from 'node:assert/strict';
import test from 'node:test';
import { browserLifetime } from './lifetime';
import { installPresentationLatch } from './presentation-latch';
test('052 transient blur/hidden during asynchronous setup remains latched after regain', async () => {
  for (const kind of ['blur', 'hidden']) {
    const windowTarget = new EventTarget(),
      documentTarget = Object.assign(new EventTarget(), {
        hidden: false,
        focused: true,
        hasFocus() {
          return this.focused;
        },
      });
    const lifetime = browserLifetime(),
      latch = installPresentationLatch(windowTarget, documentTarget, lifetime);
    const setup = Promise.resolve().then(() => {
      if (kind === 'blur') windowTarget.dispatchEvent(new Event('blur'));
      else {
        documentTarget.hidden = true;
        documentTarget.dispatchEvent(new Event('visibilitychange'));
        documentTarget.hidden = false;
      }
    });
    await setup;
    assert.equal(documentTarget.hasFocus() && !documentTarget.hidden, true);
    assert.equal(latch.lost, true);
    lifetime.dispose();
    lifetime.dispose();
    assert.equal(lifetime.snapshot().attempted, 2);
  }
  const w = new EventTarget(),
    doc = Object.assign(new EventTarget(), { hidden: false, hasFocus: () => true });
  const scope = browserLifetime(),
    latch = installPresentationLatch(w, doc, scope);
  scope.dispose();
  w.dispatchEvent(new Event('blur'));
  assert.equal(latch.lost, false);
});
