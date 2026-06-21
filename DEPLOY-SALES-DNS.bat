@echo off
cd /d "%~dp0"
REM Opens GoDaddy in your existing Chrome — does NOT close the browser
start "" "https://dcc.godaddy.com/control/dnsmanagement?domainName=leaflock.com.au"
node scripts\chrome-dns.mjs
pause