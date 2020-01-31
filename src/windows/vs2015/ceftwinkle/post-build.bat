@echo off
echo Configuration:%1
echo PlatformTarget:%2
set ROOT_DIR=..\..\..\..
if %2 == x64 (
  set CEF_DIR=%ROOT_DIR%\src\windows\lib\cef_binary_windows64
) else (
  set CEF_DIR=%ROOT_DIR%\src\windows\lib\cef_binary_windows32
)
echo Adding manifest ...
mt.exe -nologo -manifest "..\..\compatibility.manifest" -outputresource:"%1\twinkle.exe";#1
if %errorlevel% neq 0 goto :Failed

echo Copying CEF files 
xcopy /s /d %CEF_DIR%\%1 %1 
if %errorlevel% neq 0 goto :Failed
xcopy /s /d %CEF_DIR%\Resources %1 
if %errorlevel% neq 0 goto :Failed
xcopy /s /d %ROOT_DIR%\..\twinkle-lisp\lib\windows\pthreads-2.9.1\dll\%2\pthreadVC2.dll %1 
if %errorlevel% neq 0 goto :Failed

if %1 == Debug goto :Done
del %1\*.lib %1\*.log %1\*.exp

:Done
echo OK
goto :End
:Failed
echo post-build failed 
:End