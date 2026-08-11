#!/bin/bash
set -euo pipefail

cp /opt/amanor/mongo-test-keyfile /tmp/amanor-mongo-keyfile
chown mongodb:mongodb /tmp/amanor-mongo-keyfile
chmod 400 /tmp/amanor-mongo-keyfile
exec /usr/local/bin/docker-entrypoint.sh mongod --replSet rs0 --bind_ip_all --port 27017 --auth --keyFile /tmp/amanor-mongo-keyfile
