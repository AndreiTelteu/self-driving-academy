from pathlib import Path
import subprocess,tempfile,json
root=Path.cwd();wt=root/'.worktrees/wheel-dynamics-01'
base=subprocess.check_output(['git','merge-base','HEAD','loop-pbi/wheel-dynamics-01'],text=True).strip()
paths=subprocess.check_output(['git','diff','--name-only','HEAD...loop-pbi/wheel-dynamics-01','--','src','tests','scripts','Docs/wheel-dynamics.md'],text=True).splitlines()
paths+=subprocess.check_output(['git','-C',str(wt),'diff','--name-only','--','src','tests','scripts'],text=True).splitlines()
paths+=subprocess.check_output(['git','-C',str(wt),'ls-files','--others','--exclude-standard','src','tests','scripts'],text=True).splitlines()
results=[];outputs={}
with tempfile.TemporaryDirectory(prefix='pbi026-merge-') as temp:
    for path in sorted(set(paths)):
        dest=root/path;theirs=(wt/path).read_bytes()
        old=subprocess.run(['git','show',f'{base}:{path}'],capture_output=True)
        if not dest.exists(): outputs[path]=theirs;results.append({'path':path,'result':'added'});continue
        ours=dest.read_bytes()
        if ours==theirs:continue
        if old.returncode:
            raise RuntimeError(f'Independent added path collision: {path}')
        files=[Path(temp)/x for x in ['ours','base','theirs']]
        for file,data in zip(files,[ours,old.stdout,theirs]):file.write_bytes(data)
        merge=subprocess.run(['git','merge-file','-p','--diff3',*[str(x) for x in files]],capture_output=True)
        if merge.returncode:
            conflict=root/'Docs/Evidence/026-laptop/integration-conflicts'/path
            conflict.parent.mkdir(parents=True,exist_ok=True)
            if not conflict.exists(): conflict.write_bytes(merge.stdout)
            resolved=conflict.read_bytes()
            if b'<<<<<<<' in resolved:
                print(f'CONFLICT {path}');continue
            outputs[path]=resolved;results.append({'path':path,'result':'resolved'});continue
        outputs[path]=merge.stdout;results.append({'path':path,'result':'merged'})
    if any(b'<<<<<<<' in file.read_bytes() for file in (root/'Docs/Evidence/026-laptop/integration-conflicts').rglob('*') if file.is_file()):
        raise RuntimeError('Resolve saved integration conflicts first; no outputs written')
    for path,data in outputs.items():
        dest=root/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
(root/'Docs/Evidence/026-laptop/integration-files.json').write_text(json.dumps({'base':base,'files':results},indent=2))
print(json.dumps(results,indent=2))
