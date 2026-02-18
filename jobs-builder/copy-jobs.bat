@echo off
echo Copying Astro build output to jobs folder...

REM Remove old jobs folder
if exist "..\jobs" (
    echo Removing old jobs folder...
    rmdir /s /q "..\jobs"
)

REM Copy dist/jobs to parent jobs folder
echo Copying new build...
xcopy /E /I /Y "dist\jobs" "..\jobs"

echo Done! Job files copied successfully.
