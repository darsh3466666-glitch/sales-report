Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = currentDir & "\start_supervisor.bat"
WshShell.Run "cmd /c """ & batPath & """", 0, False
