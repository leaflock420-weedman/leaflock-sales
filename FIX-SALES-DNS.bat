@echo off
echo.
echo === FIX sales.leaflock.com.au (Cloudflare Error 1001) ===
echo.
echo PROBLEM: sales CNAME may still point to leaflock.com.au (wrong).
echo          Render service leaflock-sales may not be deployed yet.
echo.
echo GODADDY DNS - do ALL of this:
echo   1. Delete ANY CNAME record where Name = sales and Value = leaflock.com.au
echo   2. Add or edit ONE record only:
echo        Type:  CNAME
echo        Name:  sales
echo        Value: leaflock-sales.onrender.com
echo        TTL:   600 or 1 Hour
echo   3. Save
echo.
echo RENDER (must exist before custom domain works):
echo   1. New + -^> Blueprint -^> connect repo leaflock-sales
echo   2. Wait until deploy is Live
echo   3. Settings -^> Custom Domains -^> add sales.leaflock.com.au
echo   4. Environment: GITHUB_TOKEN, CRM_TEAM_PASSWORD
echo.
start "" "https://dcc.godaddy.com/control/dnsmanagement?domainName=leaflock.com.au"
start "" "https://dashboard.render.com/select-repo?type=blueprint"
pause