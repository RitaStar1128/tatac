@echo off
echo Removing tatac sync-node auto-start...
schtasks /delete /tn "TatacSyncNode" /f
if %errorlevel% equ 0 (
    echo Done. Auto-start removed.
) else (
    echo Task not found or already removed.
)
pause
