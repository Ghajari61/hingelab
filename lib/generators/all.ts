/** Every generator, loaded eagerly: for tests, the help centre (server) and scripts only. */
import { BOXES } from "./boxes";
import { CLOCK } from "./clock";
import { KEYRACK } from "./keyrack";
import { PUZZLE } from "./puzzle";
import { QR } from "./qr";
import { SHADOWBOX } from "./shadowbox";
import { SIGN } from "./sign";
import { TABLENUM } from "./tablenum";
import { TESTCARD } from "./testcard";
import { TOPPER } from "./topper";
import { TROPHY } from "./trophy";
import type { AnyGenerator } from "./types";

export const ALL_GENERATORS: AnyGenerator[] = [CLOCK, PUZZLE, QR, BOXES, TOPPER, KEYRACK, SIGN, TABLENUM, TROPHY, SHADOWBOX, TESTCARD];
