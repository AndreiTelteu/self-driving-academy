import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GAME_SHELL_DT_SECONDS,
  GAME_SHELL_VERSION,
  GAME_SYSTEMS,
  createGameShell,
  type GameShell,
  type GameShellWorld,
  type GameTickContext,
} from '../../src/app/game-shell';

interface TestWorld extends GameShellWorld {
  readonly steps: number[];
  presentations: number;
}

function fakeWorld(initialTick = 1): TestWorld {
  let tick = initialTick;
  const world: TestWorld = {
    version: '260-test-world-v1',
    steps: [],
    presentations: 0,
    currentTick: () => tick,
    step(next: number): void {
      world.steps.push(next);
      tick = next;
    },
    present(): void {
      world.presentations += 1;
    },
  };
  return world;
}

interface Fixture {
  readonly shell: GameShell;
  readonly world: TestWorld;
  readonly suspensions: readonly string[];
  readonly resumes: readonly string[];
  readonly heldResets: number;
}

function fixture(
  ports: Parameters<typeof createGameShell>[0]['ports'] = {},
  initialTick = 1,
): Fixture {
  const suspensions: string[] = [];
  const resumes: string[] = [];
  const held = { count: 0 };
  const shell = createGameShell({
    context: { sessionId: '260-game-shell-test', worldEpoch: 7 },
    ports,
    suspend: (cause) => suspensions.push(cause),
    resume: (cause) => resumes.push(cause),
    resetHeldCommands: () => {
      held.count += 1;
    },
    now: () => 0,
  });
  return {
    shell,
    world: fakeWorld(initialTick),
    suspensions,
    resumes,
    get heldResets() {
      return held.count;
    },
  };
}

test('260: tick order declares the world once, all phases in contract order, and every owner 261–286', () => {
  const ids = GAME_SYSTEMS.map((system) => system.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((id) => id === 'world').length, 1);
  assert.ok(ids.indexOf('control') < ids.indexOf('world'));
  assert.ok(ids.indexOf('traffic') < ids.indexOf('world'));
  assert.ok(ids.indexOf('world') < ids.indexOf('rides'));
  assert.ok(ids.indexOf('rides') < ids.indexOf('economy'));
  assert.ok(ids.indexOf('telemetry') < ids.indexOf('learning'));
  assert.ok(ids.indexOf('persistence') > ids.indexOf('learning'));
  assert.ok(ids.indexOf('camera') > ids.indexOf('persistence'));
  assert.ok(ids.indexOf('hud') > ids.indexOf('camera'));
  const owners = new Set<number>();
  for (const system of GAME_SYSTEMS)
    for (const match of system.owner.matchAll(/(\d{3})(?:–(\d{3}))?/g)) {
      const first = Number(match[1]);
      const last = match[2] === undefined ? first : Number(match[2]);
      for (let task = first; task <= last; task += 1) owners.add(task);
    }
  for (let task = 261; task <= 286; task += 1)
    assert.ok(owners.has(task), `missing owner for PBI ${task}`);
  const phases = new Set(GAME_SYSTEMS.map((system) => system.phase));
  assert.deepEqual(
    [...phases],
    ['PRE_WORLD', 'WORLD', 'POST_WORLD', 'PERSISTENCE', 'PRESENTATION'],
  );
});

test('260: one tick advances the V3 world once and calls present ports in declared order', () => {
  const calls: string[] = [];
  const contexts: GameTickContext[] = [];
  const f = fixture({
    control: {
      id: 'control',
      step: (context) => {
        calls.push('control');
        contexts.push(context);
      },
    },
    economy: { id: 'economy', step: () => calls.push('economy') },
    persistence: { id: 'persistence', step: () => calls.push('persistence') },
  });
  f.shell.attachWorld(f.world);
  assert.equal(f.shell.start(), true);
  const result = f.shell.step(2);
  assert.deepEqual(f.world.steps, [2]);
  assert.deepEqual(calls, ['control', 'economy', 'persistence']);
  assert.equal(result.tick, 2);
  assert.equal(result.portsCalled, 3);
  assert.equal(result.portsAbsent, 12);
  assert.equal(result.stages, GAME_SYSTEMS.length);
  assert.equal(result.mode, 'AUTO');
  assert.equal(contexts.length, 1);
  const context = contexts[0]!;
  assert.equal(context.version, GAME_SHELL_VERSION);
  assert.equal(context.tick, 2);
  assert.equal(context.dtSeconds, GAME_SHELL_DT_SECONDS);
  assert.equal(context.sessionId, '260-game-shell-test');
  assert.equal(context.worldEpoch, 7);
  assert.equal(Object.isFrozen(context), true);
  const status = f.shell.status();
  assert.equal(status.ticks, 1);
  assert.equal(status.tick, 2);
  assert.equal(status.portsPresent, 3);
  assert.equal(status.portsAbsent, 12);
  assert.equal(status.systems.find((system) => system.id === 'world')!.status, 'PRESENT');
  assert.equal(status.systems.find((system) => system.id === 'settings')!.status, 'ABSENT');
  for (const system of status.systems)
    if (system.status === 'ABSENT') assert.equal(system.steps, 0);
  assert.equal(status.world.attached, true);
  assert.equal(status.world.tick, 2);
  assert.equal(status.world.activeWorlds, 1);
  assert.equal(status.world.maxActiveWorlds, 1);
});

test('260: duplicate, out-of-order, reentrant and post-fault ticks are refused', () => {
  const f = fixture();
  assert.throws(() => f.shell.step(2), /no world/);
  f.shell.attachWorld(f.world);
  f.shell.start();
  f.shell.step(2);
  assert.throws(() => f.shell.step(2), /expected tick 3, received 2/);
  assert.throws(() => f.shell.step(4), /expected tick 3, received 4/);
  assert.equal(f.shell.status().refusedTicks, 2);
  assert.equal(f.shell.status().ticks, 1);

  let reenter = true;
  const reentrant = fixture({
    hud: {
      id: 'hud',
      step: () => {
        if (!reenter) return;
        reenter = false;
        reentrant.shell.step(3);
      },
    },
  });
  reentrant.shell.attachWorld(reentrant.world);
  reentrant.shell.start();
  assert.throws(() => reentrant.shell.step(2), /reentrant tick refused/);
  const faulted = reentrant.shell.status();
  assert.equal(faulted.reentrantTicks, 1);
  assert.equal(faulted.ticks, 0);
  assert.equal(faulted.tick, 1);
  assert.match(faulted.fault ?? '', /reentrant/);
  assert.throws(() => reentrant.shell.step(2), /faulted/);
  // O lume nouă (reluarea după recuperare) ridică latch-ul și reia contractul de tick.
  reentrant.shell.detachWorld();
  reentrant.shell.attachWorld(fakeWorld(4));
  assert.equal(reentrant.shell.status().fault, null);
  reentrant.shell.start();
  assert.equal(reentrant.shell.step(5).tick, 5);
});

test('260: panel/focus/menu suspend through 070 and resume only after every cause clears', () => {
  const f = fixture();
  f.shell.attachWorld(f.world);
  f.shell.start();
  f.shell.step(2);

  // În AUTO observarea rămâne live: panoul nu suspendă.
  f.shell.openPanel('integration');
  assert.deepEqual(f.suspensions, []);
  assert.equal(f.shell.step(3).tick, 3);
  f.shell.closePanel();
  assert.deepEqual(f.resumes, []);

  // În MANUAL panoul suspendă tick-ul; un tick direct este refuzat.
  f.shell.setMode('MANUAL');
  f.shell.openPanel('integration');
  assert.deepEqual(f.suspensions, ['panel']);
  assert.throws(() => f.shell.step(4), /suspended/);
  f.shell.closePanel();
  assert.deepEqual(f.resumes, ['panel']);
  assert.equal(f.shell.requestResume(), true);

  // Focusul pierdut are prioritate față de panou; panoul rămâne cauză după revenirea focusului.
  f.shell.setFocusLost(true);
  f.shell.openPanel('integration');
  assert.deepEqual(f.suspensions, ['panel', 'focus']);
  f.shell.setFocusLost(false);
  assert.deepEqual(f.resumes, ['panel']);
  assert.equal(f.shell.requestResume(), false);
  f.shell.closePanel();
  assert.deepEqual(f.resumes, ['panel', 'panel']);

  // Meniul suspendă în toate modurile; focusul nu produce o tranziție nouă cât timp meniul e deschis.
  f.shell.setMenuOpen(true);
  assert.deepEqual(f.suspensions, ['panel', 'focus', 'menu']);
  f.shell.setFocusLost(true);
  assert.equal(f.shell.pauseState().cause, 'focus');
  f.shell.setFocusLost(false);
  assert.equal(f.shell.pauseState().cause, 'menu');
  assert.equal(f.shell.requestResume(), false);
  f.shell.setMenuOpen(false);
  assert.deepEqual(f.resumes, ['panel', 'panel', 'menu']);
  assert.equal(f.shell.requestResume(), true);
  assert.equal(f.heldResets, 3);
});

test('260: a second world is refused until detach; reattaching resets the tick contract', () => {
  const f = fixture();
  f.shell.attachWorld(f.world);
  assert.throws(() => f.shell.attachWorld(fakeWorld(9)), /already attached/);
  assert.equal(f.shell.status().world.attachments, 1);
  assert.equal(f.shell.status().world.maxActiveWorlds, 1);
  f.shell.detachWorld();
  assert.equal(f.shell.status().world.attached, false);
  assert.equal(f.shell.status().world.activeWorlds, 0);
  f.shell.attachWorld(fakeWorld(5));
  const status = f.shell.status();
  assert.equal(status.tick, 5);
  assert.equal(status.world.tick, 5);
  assert.equal(status.world.attachments, 2);
  assert.equal(status.world.maxActiveWorlds, 1);
  f.shell.start();
  assert.equal(f.shell.step(6).tick, 6);
  f.shell.dispose();
  assert.throws(() => f.shell.step(7), /disposed/);
  assert.throws(() => f.shell.attachWorld(fakeWorld(8)), /disposed/);
  f.shell.dispose();
});

test('260: ports are validated by declared id and the world cannot be replaced by a port', () => {
  assert.throws(
    () =>
      createGameShell({
        context: { sessionId: 'ports', worldEpoch: 1 },
        ports: { hud: { id: 'camera', step: () => {} } } as never,
        suspend: () => {},
        resume: () => {},
      }),
    /port id mismatch/,
  );
  assert.throws(
    () =>
      createGameShell({
        context: { sessionId: 'ports', worldEpoch: 1 },
        ports: { physics: { id: 'physics', step: () => {} } } as never,
        suspend: () => {},
        resume: () => {},
      }),
    /unknown port/,
  );
  assert.throws(
    () =>
      createGameShell({
        context: { sessionId: 'ports', worldEpoch: 1 },
        ports: { world: { id: 'world', step: () => {} } } as never,
        suspend: () => {},
        resume: () => {},
      }),
    /unknown port/,
  );
});

test('260: tick and presentation costs are sampled separately and capped', () => {
  let clock = 0;
  const cost = 0.25;
  const shell = createGameShell({
    context: { sessionId: 'costs', worldEpoch: 1 },
    suspend: () => {},
    resume: () => {},
    // Fiecare măsurătoare citește ceasul de două ori; costul rezultat este constant.
    now: () => (clock += cost),
  });
  const world = fakeWorld(1);
  shell.attachWorld(world);
  shell.start();
  for (let tick = 2; tick <= 121; tick += 1) shell.step(tick);
  for (let frame = 0; frame < 10; frame += 1) shell.present();
  const costs = shell.status().costs;
  assert.equal(costs.tick.samples, 120);
  assert.equal(costs.tick.meanMs, cost);
  assert.equal(costs.tick.p50Ms, cost);
  assert.equal(costs.tick.p95Ms, cost);
  assert.equal(costs.tick.maxMs, cost);
  assert.equal(costs.present.samples, 10);
  assert.equal(costs.present.meanMs, cost);
  assert.equal(costs.present.p95Ms, cost);
  assert.equal(world.presentations, 10);
  // Fereastra este mărginită: după 700 de tick-uri rămân ultimele 600 de eșantioane.
  for (let tick = 122; tick <= 821; tick += 1) shell.step(tick);
  assert.equal(shell.status().costs.tick.samples, 600);
});
