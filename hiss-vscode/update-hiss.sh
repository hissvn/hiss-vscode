#! /bin/bash
(cd ~/hiss && haxe build-scripts/lib/build-nodejs-lib.hxml)
cp ~/hiss/bin/js/hiss-node.js ./