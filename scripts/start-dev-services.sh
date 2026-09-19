#!/usr/bin/env bash
# Levanta Postgres y Redis para desarrollo local (fuera de Docker).
# Uso: bash scripts/start-dev-services.sh
set -e
service postgresql start
service redis-server start
sleep 2
echo "Postgres y Redis arriba. Verificando..."
redis-cli ping
pg_isready -h localhost -p 5432
echo "Listo. Ahora: npm run start:dev"
