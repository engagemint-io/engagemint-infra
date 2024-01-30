#!/bin/bash

yarn build

INDEXER_GIT_HASH=$(git rev-parse --short HEAD) API_GIT_HASH=$(git rev-parse --short HEAD) yarn deploy
