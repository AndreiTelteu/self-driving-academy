param([int]$From=1,[int]$To=10,[string]$Suffix='first')
$ErrorActionPreference='Stop'
$expected='F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01'
$e=Join-Path $expected 'Docs/Evidence/026-wheel-dynamics/current-native-finite-checks-20261007-r12'
function WriteNew($path,$value){$f=[IO.File]::Open($path,[IO.FileMode]::CreateNew);try{$b=[Text.Encoding]::UTF8.GetBytes($value);$f.Write($b,0,$b.Length)}finally{$f.Dispose()}}
$commands=Get-Content (Join-Path $e 'commands.json') -Raw|ConvertFrom-Json
for($i=$From;$i -le $To;$i++){
 if((git rev-parse --show-toplevel) -ne $expected -or (git branch --show-current) -ne 'loop-pbi/wheel-dynamics-01' -or (git rev-parse HEAD) -ne 'e52e10b1170db7b8882d6581bdbd4027d2149fb6'){throw 'Identity mismatch'}
 $name=('{0:d2}-{1}' -f $i,$Suffix)
 $command=$commands[$i-1]
 $start=[DateTimeOffset]::Now
 WriteNew (Join-Path $e ($name+'.start.json')) (ConvertTo-Json @{command=$command;cwd=$expected;branch='loop-pbi/wheel-dynamics-01';head='e52e10b1170db7b8882d6581bdbd4027d2149fb6';startedAt=$start.ToString('o')})
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=(Get-Command node).Source;$info.Arguments=$command.Substring(5);$info.WorkingDirectory=$expected;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info;[void]$process.Start()
 $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync();$process.WaitForExit();$finish=[DateTimeOffset]::Now
 WriteNew (Join-Path $e ($name+'.stdout.txt')) $out.Result
 WriteNew (Join-Path $e ($name+'.stderr.txt')) $err.Result
 $result=@{index=$i;command=$command;cwd=$expected;startedAt=$start.ToString('o');finishedAt=$finish.ToString('o');durationMs=($finish-$start).TotalMilliseconds;exitCode=$process.ExitCode;stdout=$name+'.stdout.txt';stderr=$name+'.stderr.txt'}
 WriteNew (Join-Path $e ($name+'.result.json')) (ConvertTo-Json $result)
 Write-Output "$name exit=$($process.ExitCode) durationMs=$($result.durationMs) $command"
 if($process.ExitCode -ne 0){Write-Output $out.Result;Write-Output $err.Result;exit 1}
 $process.Dispose()
}