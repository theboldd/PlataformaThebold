#!/usr/bin/env bash
# Reinicia a API numa porta (padrão 4000) e grava o PID em storage/.api-<porta>.pid
PORT=${1:-4000}
cd "$(dirname "$0")/.."
PIDF=storage/.api-$PORT.pid
[ -f $PIDF ] && kill $(cat $PIDF) 2>/dev/null && sleep 0.4
BOLD_SCHEDULER=${BOLD_SCHEDULER:-off} PORT=$PORT nohup node --no-warnings=ExperimentalWarning server/index.js > storage/api-$PORT.log 2>&1 &
echo $! > $PIDF
sleep 1.2
curl -s localhost:$PORT/api/health && echo " api:$PORT"
