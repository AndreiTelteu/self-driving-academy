import {
  initializeBackend,
  RenderingInitializationError,
  type BackendDriver,
  type RendererKind,
} from '../../src/rendering/backend-policy';
import { createRendererRecovery, type RecoveryRenderer } from '../../src/app/renderer-recovery';
import type { CompatDeterministicCheck } from './compat-matrix';

interface FakeResource {
  readonly kind: RendererKind;
  dispose(): void;
}

interface FallbackFixture {
  readonly driver: BackendDriver<number, FakeResource, FakeResource>;
  readonly events: string[];
}

function fallbackFixture(options: {
  webgpu: boolean;
  webgl2: 'ok' | 'missing' | 'webgl1';
}): FallbackFixture {
  const events: string[] = [];
  let canvas = 0;
  return {
    events,
    driver: {
      supportsWebGPU: async () => {
        events.push('support-webgpu');
        return options.webgpu;
      },
      freshCanvas: () => ++canvas,
      createEngine: (serial, kind) => {
        events.push(`engine:${kind}:${serial}`);
        if (kind === 'WEBGL2' && options.webgl2 === 'missing') {
          events.push('webgl2-context-missing');
          throw new Error('WebGL 2 context unavailable');
        }
        return {
          kind,
          dispose: () => events.push(`dispose-engine:${kind}`),
        };
      },
      initializeEngine: async (engine) => {
        if (engine.kind === 'WEBGL2' && options.webgl2 === 'webgl1') {
          events.push('webgl1-rejected');
          throw new Error('WebGL 1 is unsupported');
        }
      },
      createScene: (engine) => ({
        kind: engine.kind,
        dispose: () => events.push(`dispose-scene:${engine.kind}`),
      }),
      initializeScene: async () => {},
      releaseCanvas: (serial) => events.push(`release:${serial}`),
    },
  };
}

function detailOf(error: unknown): string {
  if (error instanceof RenderingInitializationError)
    return `${error.name}: ${error.message} (cauze: ${error.errors
      .map((cause) => (cause instanceof Error ? cause.message : String(cause)))
      .join(' | ')})`;
  return String(error);
}

async function runFallbackCheck(
  id: string,
  title: string,
  options: Parameters<typeof fallbackFixture>[0],
  preference: 'AUTO' | 'WEBGPU' | 'WEBGL2',
  assert: (fixture: FallbackFixture, backendKind: RendererKind | undefined, error: unknown) => void,
): Promise<CompatDeterministicCheck> {
  const fixture = fallbackFixture(options);
  let backendKind: RendererKind | undefined;
  let error: unknown;
  try {
    const backend = await initializeBackend(0, preference, fixture.driver);
    backendKind = backend.rendererKind;
    backend.dispose();
  } catch (failure: unknown) {
    error = failure;
  }
  try {
    assert(fixture, backendKind, error);
    return {
      id,
      title,
      pass: true,
      detail:
        error === undefined
          ? `backend efectiv ${backendKind}`
          : `backend ${backendKind ?? 'NONE'}; ${detailOf(error)}`,
    };
  } catch (failure: unknown) {
    return {
      id,
      title,
      pass: false,
      detail: `${String(failure)}; backend ${backendKind ?? 'NONE'}; ${detailOf(error)}`,
    };
  }
}

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Verificările de fallback care nu cer GPU: aceeași politică reală din `src/rendering`, pe cele
 * patru combinații de capabilități plus cazul WebGL 1.
 */
export async function runFallbackChecks(): Promise<CompatDeterministicCheck[]> {
  return [
    await runFallbackCheck(
      'fallback-webgpu-disponibil',
      'WebGPU disponibil → backend efectiv WebGPU',
      { webgpu: true, webgl2: 'ok' },
      'AUTO',
      (_fixture, backend) => require(backend === 'WEBGPU', 'AUTO nu a ales WebGPU'),
    ),
    await runFallbackCheck(
      'fallback-webgpu-lipsa',
      'WebGPU absent → fallback automat pe WebGL 2',
      { webgpu: false, webgl2: 'ok' },
      'AUTO',
      (fixture, backend) => {
        require(backend === 'WEBGL2', 'AUTO nu a revenit la WebGL 2');
        require(!fixture.events.some((event) =>
          event.startsWith('engine:WEBGPU'),
        ), 'a încercat WebGPU deși suportul lipsea');
      },
    ),
    await runFallbackCheck(
      'fallback-webgl2-fortat',
      'Preferința WebGL 2 nu consultă WebGPU',
      { webgpu: true, webgl2: 'ok' },
      'WEBGL2',
      (fixture, backend) => {
        require(backend === 'WEBGL2', 'preferința WebGL 2 nu a fost respectată');
        require(!fixture.events.includes('support-webgpu'), 'a consultat WebGPU în modul forțat');
      },
    ),
    await runFallbackCheck(
      'fallback-preferinta-webgpu',
      'Preferința WebGPU fără suport → WebGL 2',
      { webgpu: false, webgl2: 'ok' },
      'WEBGPU',
      (_fixture, backend) =>
        require(backend === 'WEBGL2', 'preferința WebGPU nu a revenit la WebGL 2'),
    ),
    await runFallbackCheck(
      'fallback-fara-backend',
      'Niciun backend → eroare explicită, nu ecran gol',
      { webgpu: false, webgl2: 'missing' },
      'AUTO',
      (_fixture, backend, error) => {
        require(backend === undefined, 'a raportat un backend când ambele lipsesc');
        require(error instanceof RenderingInitializationError, 'eroarea nu este explicită');
        require(error.message.includes(
          'WebGPU și WebGL 2 nu sunt disponibile',
        ), 'mesajul de incompatibilitate lipsește');
        require(error.errors.length >= 2, 'cauzele nu sunt păstrate');
      },
    ),
    await runFallbackCheck(
      'fallback-doar-webgl1',
      'Doar WebGL 1 → refuz explicit, fără fallback ascuns',
      { webgpu: false, webgl2: 'webgl1' },
      'AUTO',
      (fixture, backend, error) => {
        require(backend === undefined, 'WebGL 1 nu trebuie acceptat');
        require(fixture.events.includes('webgl1-rejected'), 'nu a încercat contextul WebGL 2');
        require(error instanceof RenderingInitializationError, 'eroarea nu este explicită');
        require(error.errors.some(
          (cause: unknown) => cause instanceof Error && cause.message === 'WebGL 1 is unsupported',
        ), 'motivul WebGL 1 lipsește din agregat');
      },
    ),
  ];
}

interface RecoveryFixture {
  readonly recovery: ReturnType<
    typeof createRendererRecovery<{ tick: number; body: { x: number; z: number } }>
  >;
  readonly states: string[];
  readonly created: () => number;
  readonly live: () => number;
  readonly fail: (count: number) => void;
  readonly loss: (reason: string) => void;
  readonly paused: () => boolean;
  readonly world: { tick: number; body: { x: number; z: number } };
}

function recoveryFixture(): RecoveryFixture {
  const world = { tick: 417, body: { x: 2, z: 9 } };
  let paused = false;
  let created = 0;
  let live = 0;
  let failures = 0;
  let loss: (reason: string) => void = () => {};
  const states: string[] = [];
  const recovery = createRendererRecovery({
    captureSnapshot: () => ({ tick: world.tick, body: { ...world.body } }),
    suspendSimulation: () => {
      paused = true;
    },
    createRenderer: async (snapshot, _preference, onLost): Promise<RecoveryRenderer> => {
      require(paused, 'simularea nu a fost suspendată înainte de reconstrucție');
      require(snapshot.tick === 417, 'checkpoint-ul a pierdut tick-ul');
      if (failures-- > 0) throw new Error('Injected compat reconstruction failure');
      created++;
      live++;
      loss = onLost;
      let disposed = false;
      return {
        rendererKind: 'fixture',
        render() {},
        resize() {},
        dispose() {
          if (disposed) return;
          disposed = true;
          live--;
        },
      };
    },
    show: (state) => states.push(state.kind),
  });
  return {
    recovery,
    states,
    created: () => created,
    live: () => live,
    fail: (count) => {
      failures = count;
    },
    loss: (reason) => loss(reason),
    paused: () => paused,
    world,
  };
}

/**
 * Verificările deterministe de recuperare: aceeași mașină de stări folosită în browser, fără GPU.
 * Dovedește că o pierdere reface scena din checkpoint-ul RAM și că un eșec repetat lasă un mesaj
 * reîncercabil în loc de un renderer înghețat.
 */
export async function runRecoveryChecks(): Promise<CompatDeterministicCheck[]> {
  const fixture = recoveryFixture();
  const { recovery, states } = fixture;
  const checks: CompatDeterministicCheck[] = [];
  const record = (id: string, title: string, action: () => void): void => {
    try {
      action();
      checks.push({ id, title, pass: true, detail: `stări: ${states.join(' → ')}` });
    } catch (error: unknown) {
      checks.push({
        id,
        title,
        pass: false,
        detail: `${String(error)}; stări: ${states.join(' → ')}`,
      });
    }
  };

  await recovery.start('WEBGL2');
  const first = recovery.getState();
  record('recuperare-pornire', 'Pornirea ajunge în READY pe primul renderer', () => {
    require(first.kind === 'READY', 'starea inițială nu este READY');
    require(fixture.created() === 1 && fixture.live() === 1, 'renderer-ul inițial lipsește');
    require(fixture.paused(), 'simularea nu a fost suspendată');
  });

  fixture.loss('compat simulated GPU loss');
  await recovery.recover('await pending loss recovery');
  const afterLoss = recovery.getState();
  record('recuperare-pierdere', 'Pierderea de dispozitiv reconstruiește din același tick', () => {
    require(afterLoss.kind === 'READY', 'nu a revenit în READY după pierdere');
    require(afterLoss.generation === first.generation + 1, 'generația nu a avansat exact o dată');
    require(fixture.created() === 2, 'renderer-ul nu a fost recreat');
    require(recovery.getSnapshot()?.tick === 417, 'tick-ul nu a fost păstrat');
    require(fixture.live() === 1, 'a rămas mai mult de un renderer viu');
  });

  fixture.fail(2);
  await recovery.recover('compat repeated failure');
  const failed = recovery.getState();
  const failedError = failed.kind === 'ERROR' ? failed : null;
  record('recuperare-esec-mesaj', 'Eșecul repetat afișează mesaj și reîncercare', () => {
    require(failedError !== null, 'eșecul nu a produs ERROR');
    require(failedError.retryAvailable, 'reîncercarea nu este disponibilă');
    require(failedError.message.length > 0, 'mesajul de eroare este gol');
    require(recovery.getRenderer() === undefined, 'renderer-ul defect a rămas activ');
    require(fixture.live() === 0, 'nu toate resursele au fost eliberate');
  });
  const checkpoint = recovery.getSnapshot();
  await recovery.retry();
  const failedAgain = recovery.getState();
  record('recuperare-checkpoint-stabil', 'Reîncercarea păstrează același checkpoint RAM', () => {
    require(failedAgain.kind === 'ERROR', 'al doilea eșec nu a rămas ERROR');
    require(recovery.getSnapshot() === checkpoint, 'checkpoint-ul a fost recapturat sau pierdut');
  });
  await recovery.retry();
  const restored = recovery.getState();
  record('recuperare-reluare', 'Reîncercarea explicită restaurează READY fără reset', () => {
    require(restored.kind === 'READY', 'reîncercarea nu a ajuns READY');
    require(restored.generation > afterLoss.generation, 'generația nu a avansat la reluare');
    require(recovery.getSnapshot() === checkpoint, 'checkpoint-ul nu a fost refolosit');
    require(recovery.getSnapshot()?.tick === 417, 'tick-ul s-a schimbat la reluare');
    require(fixture.world.tick === 417, 'lumea a fost avansată de recuperare');
  });
  recovery.dispose();
  return checks;
}
