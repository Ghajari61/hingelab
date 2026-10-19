/**
 * The interface fonts, served from HingeLab itself (no third-party font requests, and the Windows
 * app's CSP allows only its own files). Each face downloads only when a page uses it. The headings'
 * Archivo is loaded by the website's layout with next/font, so it is preloaded there.
 */
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/source-sans-3/wght.css";
import "@fontsource-variable/source-code-pro/wght.css";
