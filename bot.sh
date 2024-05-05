#!/bin/bash

set -e

cd "$(dirname "$0")"

set -o allexport
[ -r .env ] && source .env
set +o allexport

exec node --enable-source-maps dist
