#!/bin/bash
# Build Docker-Container for fst-web ans fstst-web
#
# Call: buildit.sh [TST|WEB]
#
set -x
if [ $# -ne 1 ]
  then
    echo "Usage buildit.sh [TST|WEB]"
    echo "Argument MUST be TST or WEB"
    exit
fi

fn="fst"

if [ "$1" == "TST" ]
   then
        fn="fstst"
fi

docker build -f Dockerfile_$1 -t ${fn}-web .
