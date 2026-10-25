/**
 * Inline script for <head>: sets the saved theme and accent before the first paint (no flash). Light unless the
 * user picked another theme; the Studio editor (/editor/…) uses its own theme, dark by default. Also the
 * classic editors' interface size and reduced motion from Settings.
 */
export const THEME_BOOT_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("hingelab-prefs")||"{}");var t=location.pathname.indexOf("/editor/")===0?(p.editorTheme||"dark"):p.themeChosen?(p.theme||"light"):"light";if(t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(["dark","darker","light"].indexOf(t)>=0)document.documentElement.dataset.theme=t;if(p.accentChosen===true&&["blue","violet","teal","orange"].indexOf(p.accent)>=0)document.documentElement.dataset.accent=p.accent;var e=p.editor||{};if(["compact","large"].indexOf(e.uiSize)>=0)document.documentElement.dataset.uiSize=e.uiSize;if(e.reduceMotion===true)document.documentElement.dataset.reduceMotion=""}catch(e){document.documentElement.dataset.theme="light"}`;
