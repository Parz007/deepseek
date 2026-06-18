#!/bin/bash
set -e

NODE_ENV=production BASE_PATH=/ PORT=3000 pnpm --filter @workspace/chat-app run build

mkdir -p .vercel/output/static
cp -r /vercel/path0/artifacts/chat-app/dist/public/. .vercel/output/static/

printf '{"version":3,"routes":[{"src":"/api/(.*)","dest":"/api/handler"},{"handle":"filesystem"},{"src":"/(.*)","dest":"/index.html"}]}' > .vercel/output/config.json
