/** Every built-in box style. To add one: a file here, its export, and its entry in BUILT_IN_STYLES. */
import { REVERSE_TUCK, STRAIGHT_TUCK } from "./tuck";
import { MAILER } from "./mailer";
import { TWO_PIECE } from "./twoPiece";
import { AUTO_BOTTOM, HANGING, SEAL_END, SNAP_LOCK } from "./cartons";
import { DRAWER, SLEEVE } from "./drawer";
import { SHIPPING } from "./shipping";
import { PILLOW } from "./pillow";
import { GABLE } from "./gable";
import { DISPLAY, OPEN_TRAY } from "./display";
import { HEXAGON } from "./hexagon";
import { CONE, CUBE, PRISM, PYRAMID } from "./shapes";
import { BAKERY, CLAMSHELL, HINGED_LID, PIE, TAKEOUT } from "./food";
import { BAG, CARRY, WINE } from "./carry";
import { INSERT, SLEEVE_FLAT } from "./flat";

export { REVERSE_TUCK, STRAIGHT_TUCK, MAILER, TWO_PIECE, SNAP_LOCK, AUTO_BOTTOM, SEAL_END, HANGING, DRAWER, SLEEVE, SHIPPING, PILLOW, GABLE, DISPLAY, OPEN_TRAY, HEXAGON };
export { PYRAMID, PRISM, CUBE, CONE, BAKERY, HINGED_LID, PIE, CLAMSHELL, TAKEOUT, CARRY, WINE, BAG, SLEEVE_FLAT, INSERT };

/** Listed (not only imported) so a bundler that drops side-effect imports keeps them. */
export const BUILT_IN_STYLES = [
  REVERSE_TUCK, STRAIGHT_TUCK, SNAP_LOCK, AUTO_BOTTOM, SEAL_END, HANGING, HEXAGON, PILLOW,
  MAILER, SHIPPING, TWO_PIECE, DRAWER, SLEEVE, OPEN_TRAY, GABLE, DISPLAY,
  CUBE, PYRAMID, PRISM, CONE, BAKERY, HINGED_LID, PIE, CLAMSHELL, TAKEOUT, CARRY, WINE, BAG, SLEEVE_FLAT, INSERT,
];
