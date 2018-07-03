#!/bin/bash
#
# Container zum Ziel-Rechner kopieren
#
set -x

if [ $# -ne 2 ]
then
	echo "Usage: copycontainer.se NAME TO"
	echo "   NAME = name of conatainer"
	echo "   TO = Name of target computer"
	exit 1
fi
(docker save $1 | bzip2 | pv | ssh $2 'bunzip2 | docker load')

