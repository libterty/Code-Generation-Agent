#
# ---- Base Node ----
FROM node:18.19.0-alpine AS base

RUN apk update
# Crucial init the lib dependency before register work dir
RUN apk --no-cache add \
    bash \
    g++ \
    ca-certificates \
    lz4-dev \
    musl-dev \
    cyrus-sasl-dev \
    openssl \
    openssl-dev \
    make \
    python3 \
    git \
    vim

RUN apk add --no-cache --virtual .build-deps gcc zlib-dev libc-dev bsd-compat-headers py-setuptools bash

# set working directory
WORKDIR /root/code_generation_agent
# copy project file
COPY . .

#
# ---- Dependencies ----
FROM base AS dependencies
# install node packages
RUN npm set progress=false && npm config set depth 0
RUN npm ci
RUN npm i -g pm2
# copy production node_modules aside
RUN cp -R node_modules prod_node_modules
# install ALL node_modules, including 'devDependencies'
RUN npm ci

#
# ---- Build ----
# run linters, setup and tests
FROM dependencies AS build
COPY . .
RUN npm run build

#
# ---- Release ----
FROM base AS release
ENV NODE_ENV=production

# Main Env
ENV API_PREFIX="v1"
ENV API_EXPLORERPATH="api"

ENV ENDPONIT_RATE_LIMIT=100
ENV ENDPONIT_RATE_TTL=60


# Connection Limit
ENV CONNECTION_POOL_MAX="100"
ENV REBALANCE_WINDOW_SECONDS="1800"
ENV OUT_RANGE_SECONDS="1000"

ENV LOG_PATH="/logs"

# copy production node_modules
COPY --from=dependencies /root/code_generation_agent/prod_node_modules ./node_modules

## copy work dir sources
COPY . .
COPY --from=build /root/code_generation_agent/dist ./dist

EXPOSE 7080
