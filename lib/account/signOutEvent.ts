/**
 * Sign out from the shared account menu inside the desktop app. The app has no /auth/signout
 * route, so the menu raises this window event and the desktop shell signs the whole app out.
 */
export const DESKTOP_SIGN_OUT = "hingelab-sign-out";
