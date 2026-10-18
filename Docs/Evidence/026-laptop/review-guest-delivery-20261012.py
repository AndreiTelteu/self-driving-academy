import json, hashlib
from pathlib import Path
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[3]
evidence = root / 'Docs/Evidence/026-laptop'
numeric_path = evidence / 'guest-both-full-20261012-r1.json'
numeric = json.loads(numeric_path.read_text())
assert numeric['verification']['state'] == 'NUMERIC_PASS'
base = root / 'Docs/Evidence/026-wheel-dynamics'

def unwrap(path):
    envelope = json.loads(path.read_text())
    payload = envelope['payload'].encode()
    assert len(payload) == envelope['bytes']
    assert hashlib.sha256(payload).hexdigest() == envelope['sha256']
    return json.loads(payload)['dto']

def closed(life):
    assert life['closed'] and not life['failed']
    assert not life['causes'] and not life['overflow'] and not life['lateCount']
    assert not life.get('causeOverflow', 0) and life['pending'] == 0
    for event in life['journal']:
        if 'focused' in event: assert event['focused']
        if 'hidden' in event: assert not event['hidden']

captures = []
for capture_id in [numeric['webgpuId'], numeric['webgl2Id']]:
    directory = base / 'laptop-20261011-browser' / capture_id
    terminal = unwrap(directory / 'terminal.json')
    assert terminal['state'] == 'CAPTURE_COMPLETE'
    closed(terminal['lifetime'])
    assert terminal['readbacks'] == {'surface': {'connected': False}, 'backend': {'sceneDisposed': True}, 'engine': {'engineDisposed': True}}
    runs = terminal['report']['runs']
    assert len(runs) == 10
    for index, run in enumerate(runs):
        raw = unwrap(directory / f'raw-{index}.json')
        closed(raw['lifetime'])
        assert run['longTasks'] == {'supported': True, 'count': 0, 'maxMs': 0}
        assert run['overloadCount'] == 0
        assert run['physics'] == {'vehicles': 70, 'bodies': 134, 'colliders': 138}
        assert run['memory']['retainedWheelHistory'] == 0
        assert run['sampleBytes'] == 1200000
    calibration = terminal['report']['calibration']
    assert len(calibration) == 8
    for class_id in ['sedan', 'compact']:
        braking = {r['surface']: r for r in calibration if r['classId'] == class_id and r['scenario'] == 'braking'}
        assert all(r['stopped'] for r in braking.values())
        assert braking['reduced-adhesion']['brakingDistanceM'] > 1.1 * braking['dry-asphalt']['brakingDistanceM']
    captures.append({'id': capture_id, 'renderer': terminal['renderer'], 'arms': len(runs), 'calibrations': len(calibration), 'steadyLongTasks': 0, 'focusJournal': 'PASS', 'cleanup': 'PASS'})

after = json.loads((base / 'after-visual-query-20261011-r1/node.json').read_text())
pricing = []
for pair in range(5):
    off = next(r for r in after['runs'] if r['pair'] == pair and not r['observe'])
    on = next(r for r in after['runs'] if r['pair'] == pair and r['observe'])
    assert off['inputHash'] == on['inputHash'] and off['physicalHash'] == on['physicalHash']
    pricing.append({'pair': pair, 'offWallMs': off['elapsedWallMs'], 'onWallMs': on['elapsedWallMs'], 'deltaWallMsPerMeasuredTick': (on['elapsedWallMs'] - off['elapsedWallMs']) / 600})

report = {
    'state': 'PARENT_REVIEW_PASS_EARLY_026_FIXTURE',
    'reviewer': 'Codex parent /root',
    'reviewedAt': datetime.now(timezone.utc).isoformat(),
    'numericReportSha256': hashlib.sha256(numeric_path.read_bytes()).hexdigest(),
    'sourceHash': numeric['sourceHash'],
    'physicalForeground': {'windowId': 32507982, 'profile': 'Chrome Guest', 'singleTab': 'http://127.0.0.1:5220/', 'evidence': 'User Guest deschis; native window screenshot Guest badge and target HWND; serial progress observations and continuously focused journals', 'devTools': 'closed', 'power': 'User confirmed powered; Win32_Battery status2/80percent after both captures'},
    'physicalDrivingReview': 'Real native braking/turning curves in eight calibrations per browser; native28 scenarios also verify fast/slow turning, curb and airborne/recontact. Visual scalar/native parity test and Guest current-scene screenshot reviewed. This is early calibration, not a manual driving or integrated-game certification.',
    'captures': captures,
    'instrumentationReview': {'browser': 'Full channels fixed-capacity1.2MB per arm, lifecycle journal bounded4096, no wheel history. Main includes loop/native/query/projection/render and lifecycle boundaries; LongTask observer retains whole event-loop tasks. No diagnostic trace/DevTools in acceptance. No overhead subtraction or claimed exact pure browser observer price.', 'nativeObserverOnOff': pricing, 'nativePriceScope': 'Five actual native observer OFF/ON pairs, matched input/physical checksums. Wall deltas include sampling, noise and scheduling, not isolated browser/GPU overhead.'},
    'limits': ['Early fixture only', 'Historical52/129ms cause unproven; profile change is a controlled-condition observation, not causal proof', 'Existing Chrome profile with extensions retains FAIL', 'GPU/input latency/controlled cold navigation/exact total RAM and WASM are not certified']
}
output = evidence / 'guest-parent-review-20261012-r1.json'
with output.open('x', encoding='utf-8') as stream:
    json.dump(report, stream, indent=2)
print(json.dumps({'state': report['state'], 'captures': captures, 'nativeObserverWallDeltas': pricing}))
