import gzip, json, collections
from pathlib import Path

root = Path(__file__).parent
trace = root / 'performance-a7cf1485.json.gz'
def events():
    with gzip.open(trace, 'rt', encoding='utf-8') as stream:
        for line in stream:
            line = line.strip().rstrip(',')
            if line.startswith('{"args"') and ('"pid":21380,' in line or 'TracingStartedInBrowser' in line or 'thread_name' in line):
                yield json.loads(line)

threads = {}
tasks = []
anchors = []
for e in events():
    if e['name'] == 'thread_name': threads[(e['pid'], e['tid'])] = e['args']['name']
    if e['name'] in ('TracingStartedInBrowser', 'navigationStart', 'FrameCommittedInBrowser'):
        anchors.append(e)
    if e['name'] == 'RunTask' and e.get('dur', 0) >= 50000: tasks.append(e)
tasks = [e for e in tasks if e['pid'] == 21380 and e['tid'] == 1496]
children = [[] for _ in tasks]
for e in events():
    if e['pid'] != 21380 or e['tid'] != 1496: continue
    for i, task in enumerate(tasks):
        if task['ts'] <= e['ts'] < task['ts'] + task['dur'] and e['name'] != 'RunTask':
            children[i].append(e)
result = {'anchors': anchors, 'tasks': []}
for task, items in zip(tasks, children):
    result['tasks'].append({'task':task, 'events': sorted([e for e in items if e.get('dur',0)>1000], key=lambda e:-e['dur'])[:20], 'names':dict(collections.Counter(e['name'] for e in items))})
(root/'performance-tasks.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
for item in result['tasks']:
    print(json.dumps({'durationMs':item['task']['dur']/1000,'ts':item['task']['ts'],'events':[(e['name'],e.get('dur',0)/1000,e.get('args')) for e in item['events'][:8]]}))
