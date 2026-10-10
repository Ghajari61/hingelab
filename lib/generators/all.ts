/** Every generator, loaded eagerly: for tests, the help centre (server) and scripts only. */
import { CLOCK } from "./clock";
import { PUZZLE } from "./puzzle";
import { QR } from "./qr";
import type { AnyGenerator } from "./types";

export const ALL_GENERATORS: AnyGenerator[] = [CLOCK, PUZZLE, QR];
