/** Every built-in box style. To add one: a file here, its export, and its entry in BUILT_IN_STYLES. */
import { REVERSE_TUCK, STRAIGHT_TUCK } from "./tuck";
import { MAILER } from "./mailer";
import { TWO_PIECE } from "./twoPiece";

export { REVERSE_TUCK, STRAIGHT_TUCK, MAILER, TWO_PIECE };

/** Listed (not only imported) so a bundler that drops side-effect imports keeps them. */
export const BUILT_IN_STYLES = [REVERSE_TUCK, STRAIGHT_TUCK, MAILER, TWO_PIECE];
