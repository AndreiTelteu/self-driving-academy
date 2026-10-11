import gzip,json
from pathlib import Path
root=Path(__file__).parent
profiles=[]
with gzip.open(root/'performance-a7cf1485.json.gz','rt',encoding='utf-8') as stream:
    for line in stream:
        if '"name":"Profile' in line and '"pid":21380,' in line:
            profiles.append(json.loads(line.strip().rstrip(',')))
(root/'cpu-profile.json').write_text(json.dumps(profiles),encoding='utf-8')
print('profile records',len(profiles))
print(json.dumps(profiles[:1])[:1200])
