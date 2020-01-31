Name "Twinkle"

# define the name of the installer
Outfile "twinkle-installer.exe"
 
# define the directory to install to, the desktop in this case as specified  
# by the predefined $DESKTOP variable
InstallDir $PROGRAMFILES\Twinkle


Page directory
Page instfiles

UninstPage uninstConfirm
UninstPage instfiles

######################################################
# Install section
######################################################

Section
 
# define the output path for this file
SetOutPath $INSTDIR
 
# define what to install and place it in the output path
 File /r "vs2015\ceftwinkle\Release\*"
 
 SetOutPath "$INSTDIR\lisp"
 File /r "..\..\..\twinkle-lisp\lisp\*"
 
 SetOutPath "$INSTDIR\web"
 File /r "..\..\..\twinkle-notes\web\*"
 
 WriteUninstaller "$INSTDIR\uninstall.exe"
 
  CreateDirectory "$SMPROGRAMS\Twinkle"
  CreateShortCut "$SMPROGRAMS\Twinkle\Twinkle Notes.lnk" "$INSTDIR\twinkle.exe"
  CreateShortCut "$SMPROGRAMS\Twinkle\Uninstall Twinkle.lnk" "$INSTDIR\uninstall.exe"


  CreateShortCut "$DESKTOP\Twinkle Notes.lnk" "$INSTDIR\twinkle.exe" ""

SectionEnd

######################################################
# Uninstall 
######################################################

Section "uninstall"
  Delete "$INSTDIR\*"

  ; Remove shortcuts, if any
  Delete "$SMPROGRAMS\Twinkle\*.*"
  Delete "$DESKTOP\Twinkle Notes.lnk"

  ; Remove directories used
  RMDir "$SMPROGRAMS\Twinkle"
  RMDir "$INSTDIR"	
SectionEnd
