#!/bin/bash
# Build Docker-Container for fst-web ans fstst-web
#
# Call: buildit.sh [TST|WEB]
#
set -x
if [ $# -lt 1 ]
  then
    echo "Usage buildit.sh <TST|WEB> [Target]"
    echo "Argument MUST be TST or WEB"
    echo " Second Argument: Where to copy the container to (optional)"
    exit
fi

fn="fst"

if [ "$1" == "TST" ]
   then
        fn="fstst"
fi

docker build -f Dockerfile_$1 -t ${fn}-web .

if [ $2 != "" ]
then
    docker save ${fn}-web | bzip2 | pv | ssh $2 'bunzip2 | docker load'
fi