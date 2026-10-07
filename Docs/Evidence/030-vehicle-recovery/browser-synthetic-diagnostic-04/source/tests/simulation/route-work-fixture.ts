// Owner-provided cooperative synthetic graph search, not PBI045 routing gameplay.
import type { LaneGraph } from '../../src/world';
import type { RouteTask } from '../../src/simulation/scheduling';

export function syntheticRouteTask(
  graph: LaneGraph,
  origin: string,
  destination: string,
  blocked: ReadonlySet<string>,
): RouteTask {
  const forbidden = new Set(blocked),
    seen = new Set([origin]);
  let queue: string[][] = [[origin]],
    cursor = 0,
    disposed = false,
    finished = false;
  return {
    step({ maxExpansions }) {
      if (
        disposed ||
        finished ||
        !Number.isInteger(maxExpansions) ||
        maxExpansions < 1 ||
        maxExpansions > 16
      )
        throw new Error('Invalid synthetic route task lifecycle/budget');
      for (let count = 0; count < maxExpansions && cursor < queue.length; count++) {
        const path = queue[cursor++],
          lane = path[path.length - 1];
        if (forbidden.has(lane)) continue;
        if (lane === destination) {
          finished = true;
          return { done: true, path: Object.freeze(path) };
        }
        for (const successor of graph.getSuccessors(lane, 'CIVIL')) {
          if (seen.has(successor.id) || forbidden.has(successor.id)) continue;
          if (seen.size >= 64) throw new Error('Synthetic route graph exceeds64nodes');
          seen.add(successor.id);
          queue.push([...path, successor.id]);
        }
      }
      if (cursor === queue.length) {
        finished = true;
        return { done: true, path: null };
      }
      return { done: false, path: null };
    },
    dispose() {
      disposed = true;
      queue = [];
      seen.clear();
      forbidden.clear();
    },
  };
}
