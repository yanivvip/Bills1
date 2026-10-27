@echo off
rem Runs pnpm under the fnm-managed Node version pinned in .node-version,
rem without touching the system-wide Node (used by Odoo).
set "FNM=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\fnm.exe"
"%FNM%" exec --using=22 cmd /c "pnpm %*"
