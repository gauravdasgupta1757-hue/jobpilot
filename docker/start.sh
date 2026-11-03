#!/bin/sh
# The production container's command (E12-3): bring the database up to date,
# load the built-in themes, then serve. If a step fails, the container stops
# with a non-zero exit code, so CapRover and Docker don't switch over to it.
set -eu

# JobPilot: several people can share one Postgres server, each with their
# own database (DATABASE_NAME): create it if needed and point at it.
if [ -n "${DATABASE_NAME:-}" ]; then
  if ! DATABASE_URL="$(node /app/tools/ensure-database.mjs)"; then
    echo "JobPilot didn't start: preparing the database $DATABASE_NAME failed (see the error above)." >&2
    exit 1
  fi
  export DATABASE_URL
fi

cd /app/tools
if ! node node_modules/prisma/build/index.js migrate deploy; then
  echo "Dossier didn't start: applying the database migrations failed (see the error above). See Troubleshooting in the wiki: https://github.com/AienTech/dossier/wiki/Troubleshooting" >&2
  exit 1
fi
if ! node seed.mjs; then
  echo "Dossier didn't start: loading the built-in themes failed (see the error above)." >&2
  exit 1
fi

cd /app
exec node server.js
