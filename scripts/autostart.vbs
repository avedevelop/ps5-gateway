Option Explicit
' Starts the gateway (node apps\orchestrator\src\index.ts) with no window at all. Used by the "ps5gw" scheduled task
' (scripts\install-autostart.ps1): a hidden PowerShell would still flash a console window at every login.
' Argument 1: the full path of node.exe. ASCII only on purpose.
Dim sh, fso, root, node
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
If WScript.Arguments.Count < 1 Then WScript.Quit 1
node = WScript.Arguments(0)
sh.CurrentDirectory = root & "\apps\orchestrator"
sh.Run """" & node & """ src/index.ts", 0, False
