@echo off
title MGM's College Of Engineering Nanded - Conference Hall Portal
echo =================================================================
echo   MGM's College Of Engineering Nanded (MGMCEN)
echo   Sir Vishveshwarya Conference Hall Reservation System
echo =================================================================
echo.
echo Starting secure server on port 3000...
start "" http://localhost:3000
node server.js
pause
