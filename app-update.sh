#!/bin/bash

git reset --hard;
git pull;
git submodule sync --recursive;
git submodule update --init --recursive;
yarn;
tsc;
echo "Update done! Don't forget to check master service if it needs a restart!";