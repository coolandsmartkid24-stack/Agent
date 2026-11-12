#!/usr/bin/env bash
set -e
npm i -g vercel
vercel login
vercel --prod --yes
