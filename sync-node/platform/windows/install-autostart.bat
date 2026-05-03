@echo off
echo Installing tatac sync-node auto-start on login...
schtasks /create /tn "TatacSyncNode" /tr "%~dp0tatac-sync-node.exe" /sc onlogon /ru %USERNAME% /f
if %errorlevel% equ 0 (
    echo Done. tatac sync-node will start automatically when you log in.
    echo To remove: schtasks /delete /tn "TatacSyncNode" /f
) else (
    echo Failed to install. Try running as administrator.
)
pause
