#!/bin/bash
#
# Angegebene Dateien auf den Server rexfue.de in das Verzeichnis
# /home/rxf/Projekte/Feinstaub_WEB/html kopieren
#
# 2018-11-28  rxf
#   erste Version


set -x
if [ $# -lt 1 ]
  then
    echo "Usage copy2server file"
    echo "   file:   Name of file to copy"
    echo "Copy file to rexfue.de:/home/rxf/Projekte/Feinstaub_WEB/html"
    exit
fi

scp $1 rexfue.de:/home/rxf/Projekte/Feinstaub_WEB/html


