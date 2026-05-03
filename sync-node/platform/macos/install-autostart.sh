#!/bin/sh
set -e

BINARY_DIR="$(dirname "$0")"
PLIST_SRC="$BINARY_DIR/com.tatac.syncnode.plist"
BINARY_SRC="$BINARY_DIR/tatac-sync-node"
INSTALL_DIR="/usr/local/bin"
LAUNCHAGENTS="$HOME/Library/LaunchAgents"

echo "Installing tatac sync-node..."

cp "$BINARY_SRC" "$INSTALL_DIR/tatac-sync-node"
chmod +x "$INSTALL_DIR/tatac-sync-node"

mkdir -p "$LAUNCHAGENTS"
cp "$PLIST_SRC" "$LAUNCHAGENTS/com.tatac.syncnode.plist"

launchctl load "$LAUNCHAGENTS/com.tatac.syncnode.plist"

echo "Done. tatac sync-node is running and will start automatically on login."
echo "Status page: http://127.0.0.1:4010"
echo "To remove: launchctl unload ~/Library/LaunchAgents/com.tatac.syncnode.plist"
