#!/bin/sh
# This shell script will be started by cron every 5 mins
# It calls dat2mongo.py to read in the new data from 'luftdaten.info'
# At 02:00 and 14:00 hours it calls 'korrelation.py' afterward. In 'korrelation.py'
# the 'korrelations' database collection will be created or rather updated. If new
# locations or sensor ar found, then the TTL-index will be created.
#
# Version 1.0  2017-06-14  rxf
#
hour=`date +%H`
minute=`date +%M` 
echo $hour,$minute

./dat2mongo.py >>/var/log/dat2mongo.log 2>&1
if [ $minute = "00" ] && ( [ $hour = "02" ] || [ $hour = "14" ] )
  then
    ./korrelation.py >>/var/log/korrelation.log 2>&1
fi
      
    