#!/bin/sh
# `docker run --user "$(id -u):$(id -g)"` keeps workspace files owned by the runner, but that uid has no passwd entry
# in the image, and ssh refuses to start without one. Add it for this throwaway container, then run the command.
if ! whoami >/dev/null 2>&1; then
  echo "runner:x:$(id -u):$(id -g)::${HOME:-/tmp}:/bin/sh" >> /etc/passwd
fi
exec "$@"
