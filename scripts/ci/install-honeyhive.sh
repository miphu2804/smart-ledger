#!/usr/bin/env bash
# Installs the pinned HoneyHive CLI so runs are reproducible. HoneyHive's installer is Linux-only, so a macOS machine
# uses its Homebrew install and only warns when the version differs. yq v4 and jq come with the Linux image and with
# Homebrew on the self-hosted machines.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

version=1.9.0
if [ "$(uname -s)" = Linux ]; then
  curl -fsSL "https://github.com/honeyhiveai/honeyhive-cli/releases/download/v$version/install.sh" | sh
else
  command -v honeyhive > /dev/null || brew install honeyhiveai/tap/honeyhive
  installed=$(honeyhive --version)
  [ "$installed" = "$version" ] || ci_warning "HoneyHive CLI $installed on this machine, pinned to $version"
fi
