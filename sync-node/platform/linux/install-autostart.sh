#!/bin/sh
set -e

BINARY_DIR="$(dirname "$0")"
SERVICE_SRC="$BINARY_DIR/tatac-sync-node.service"
BINARY_SRC="$BINARY_DIR/tatac-sync-node"
INSTALL_DIR="$HOME/.local/bin"
SYSTEMD_DIR="$HOME/.config/systemd/user"

echo "Installing tatac sync-node..."

mkdir -p "$INSTALL_DIR"
cp "$BINARY_SRC" "$INSTALL_DIR/tatac-sync-node"
chmod +x "$INSTALL_DIR/tatac-sync-node"

mkdir -p "$SYSTEMD_DIR"
cp "$SERVICE_SRC" "$SYSTEMD_DIR/tatac-sync-node.service"

systemctl --user daemon-reload
systemctl --user enable tatac-sync-node
systemctl --user start tatac-sync-node

echo "Done. tatac sync-node is running and will start automatically on login."
echo "Status page: http://127.0.0.1:4010"
echo "To remove: systemctl --user disable --now tatac-sync-node"
