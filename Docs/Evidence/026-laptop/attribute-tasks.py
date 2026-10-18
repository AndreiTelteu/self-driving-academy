import json,collections
from pathlib import Path
root=Path(__file__).parent
p=json.loads((root/'cpu-profile.json').read_text())
tasks=json.loads((root/'performance-tasks.json').read_text())['tasks']
nodes={};samples=[];clock=None
for e in p:
    data=e['args']['data']
    if e['name']=='Profile': clock=data['startTime'];continue
    cpu=data.get('cpuProfile',{})
    for n in cpu.get('nodes',[]):nodes[n['id']]=n
    for node,delta in zip(cpu.get('samples',[]),data.get('timeDeltas',[])):
        clock+=delta
        if delta>0: samples.append((clock,node,delta))
def stack(node):
    result=[]
    while node in nodes:
        n=nodes[node];f=n['callFrame']
        result.append(f)
        node=n.get('parent')
    return result
out=[]
for item in tasks:
    t=item['task'];counts=collections.Counter(node for ts,node,delta in samples if t['ts']<=ts<t['ts']+t['dur'])
    top=[{'samples':count,'stack':stack(node)} for node,count in counts.most_common(8)]
    out.append({'durationMs':t['dur']/1000,'traceTs':t['ts'],'threadCpuMs':t.get('tdur',0)/1000,'topStacks':top})
    print(json.dumps({'durationMs':t['dur']/1000,'top':[(x['samples'],[(f.get('functionName'),f.get('url'),f.get('lineNumber')) for f in x['stack'][:5]]) for x in top[:4]]}))
(root/'performance-attribution.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
