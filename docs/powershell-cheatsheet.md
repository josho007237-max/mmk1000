# PowerShell Cheatsheet

- `uname` -> `$PSVersionTable`, `(Get-CimInstance Win32_OperatingSystem).Caption`
- `ls -la` -> `Get-ChildItem -Force`
- `head -n 30` -> `Select-Object -First 30`
- `sed -n '1,120p'` -> `Get-Content -TotalCount 120`
- `echo $PATH` -> `$env:PATH`
