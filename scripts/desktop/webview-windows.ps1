# Lists the WebView host windows (class WRY_WEBVIEW) of a process and whether Windows shows them,
# for the desktop E2E test: prints one line per window, "visible" or "hidden".
param([Parameter(Mandatory = $true)][int]$ProcessId)

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class HingeLabWindows {
  delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);

  public static List<string> WebViews(uint pid) {
    var found = new List<string>();
    EnumWindows((top, _) => {
      uint owner;
      GetWindowThreadProcessId(top, out owner);
      if (owner != pid) return true;
      EnumChildWindows(top, (child, __) => {
        var name = new StringBuilder(256);
        GetClassName(child, name, name.Capacity);
        if (name.ToString() == "WRY_WEBVIEW") found.Add(IsWindowVisible(child) ? "visible" : "hidden");
        return true;
      }, IntPtr.Zero);
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

[HingeLabWindows]::WebViews([uint32]$ProcessId) | ForEach-Object { $_ }
