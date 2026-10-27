@echo off
REM ---------------------------------------------------------------
REM  Panel de control TI
REM
REM  Este archivo solo lanza scripts\iniciar.ps1, que es donde esta la
REM  logica. Se mantiene en ASCII puro a proposito: cmd.exe corrompe
REM  los .bat que mezclan chcp 65001 con caracteres acentuados.
REM ---------------------------------------------------------------
title Panel de control TI
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar.ps1"

if errorlevel 1 pause
