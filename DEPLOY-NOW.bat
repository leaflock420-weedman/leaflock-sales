@echo off
title LeafLock Sales - Fix Cloudflare 1001
color 0A
echo.
echo  CLOUDFLARE 1001 FIX
echo  ==================
echo.
echo  Cause: Render app "leaflock-sales" does not exist yet.
echo         DNS points to Render but nothing is running there.
echo.
echo  STEP 1 - CREATE RENDER APP (Chrome opening now)
echo  -----------------------------------------------
echo  A) Click "New +" then "Web Service" (not Static Site)
echo  B) Connect GitHub repo: leaflock-sales
echo  C) Settings:
echo       Name:     leaflock-sales
echo       Runtime:  Node
echo       Build:    npm install
echo       Start:    npm start
echo       Plan:     Free
echo  D) Environment variables (add before deploy):
echo       GITHUB_TOKEN       = GitHub token with repo access
echo       CRM_TEAM_PASSWORD  = LeafLockSales2026
echo  E) Click Create Web Service - wait until status LIVE
echo  F) Test: https://leaflock-sales.onrender.com/login.html
echo         (must show login page, NOT "Not Found")
echo.
echo  STEP 2 - CUSTOM DOMAIN IN RENDER
echo  --------------------------------
echo  Settings -^> Custom Domains -^> Add: sales.leaflock.com.au
echo  Click Verify when DNS is correct
echo.
echo  STEP 3 - GODADDY DNS (only ONE sales record)
echo  --------------------------------------------
echo  Delete sales -^> leaflock.com.au if it exists
echo  Keep only:  CNAME  sales  -^>  leaflock-sales.onrender.com
echo.
start "" "https://dashboard.render.com/new/web?repo=https://github.com/leaflock420-weedman/leaflock-sales"
start "" "https://dcc.godaddy.com/control/dnsmanagement?domainName=leaflock.com.au"
pause