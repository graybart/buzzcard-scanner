@echo off
rem Stops the check-in app on Windows. Your data is kept.
docker stop scanner >nul 2>nul && (echo Check-in app stopped.) || (echo Check-in app was not running.)
