/**
 * Wood Packaging presets. They are the former Paper Box designs made in plywood: each carton
 * became the wooden box that does the same job (D215). Two-piece boxes take a lift-off lid, tuck
 * and hanging cartons a sliding lid, mailers, clamshells and hinged-lid boxes a pin hinge, drawer
 * boxes and sleeves a wooden drawer, trays a tray, hexagons a hexagon box and cell inserts a divider
 * insert. Sizes stay the inside sizes of the carton, raised to what the joints need where a carton
 * was smaller. Paper-only forms (bags, cones, pillow boxes, pyramids, prisms, takeout pails, gable
 * boxes, cereal and tissue cartons) have no wooden equivalent and were left out.
 */
import type { BoxesParams, LidKind, TrayLid } from "../boxes/params";
import type { GenPreset } from "../types";

type P = GenPreset<BoxesParams>;
type Extra = Partial<Pick<BoxesParams, "engrave" | "joint">>;
const finger = (min: number) => (min < 60 ? 6 : min < 120 ? 8 : 12);

/** A box with a lid, inside sizes in millimetres. */
function box(id: string, name: string, note: string, w: number, d: number, h: number, lid: LidKind, more: Extra = {}): P {
  const W = Math.max(20, w), D = Math.max(20, d), H = Math.max(15, h);
  return {
    id, name, note,
    params: {
      name, design: "box", joint: { finger: finger(Math.min(W, D, H)), ...(more.joint ?? {}) } as BoxesParams["joint"],
      box: { width: W, depth: D, height: H, lid, clearance: lid === "sliding" || lid === "pin" ? 0.4 : 0.3, notch: lid === "sliding" || lid === "pin", pin: 3 },
      ...(more.engrave ? { engrave: more.engrave } : {}),
    } as Partial<BoxesParams>,
  };
}

function tray(id: string, name: string, note: string, w: number, d: number, h: number, cols = 1, rows = 1, lid: TrayLid = "none", more: Extra = {}): P {
  const W = Math.max(40, w), D = Math.max(40, d), H = Math.max(15, h);
  return {
    id, name, note,
    params: { name, design: "tray", joint: { finger: finger(Math.min(W, D, H)) } as BoxesParams["joint"], tray: { width: W, depth: D, height: H, cols, rows, dividers: 100, lid }, ...(more.engrave ? { engrave: more.engrave } : {}) } as Partial<BoxesParams>,
  };
}

function drawer(id: string, name: string, note: string, w: number, d: number, h: number, pull: BoxesParams["drawer"]["pull"] = "notch"): P {
  const W = Math.max(60, w), D = Math.max(50, d), H = Math.max(30, h);
  return { id, name, note, params: { name, design: "drawer", joint: { finger: finger(Math.min(W, D, H)) } as BoxesParams["joint"], drawer: { width: W, depth: D, height: H, drawers: 1, pull, clearance: 0.5 } } as Partial<BoxesParams> };
}

function hex(id: string, name: string, note: string, side: number, h: number): P {
  const across = Math.max(40, Math.round(side * Math.sqrt(3)));
  return { id, name, note, params: { name, design: "hex", hex: { width: across, height: Math.max(15, h), lid: "liftoff", clearance: 0.3 } } as Partial<BoxesParams> };
}

function insert(id: string, name: string, note: string, w: number, d: number, h: number, cols: number, rows: number): P {
  return { id, name, note, params: { name, design: "insert", insert: { width: w, depth: d, height: h, cols, rows, clearance: 0.5 } } as Partial<BoxesParams> };
}

const mark = (text: string, fontId = "pacifico", size = 16): Extra => ({ engrave: { text, fontId, size } as BoxesParams["engrave"] });
const s = (w: number, d: number, h: number) => `${w} × ${d} × ${h} mm inside`;

export const PAPERBOX_PRESETS: P[] = [
  // the product collection's studio pieces
  drawer("studio-accessory-drawer", "Accessory drawer box", "Wooden sleeve with a sliding drawer and finger notch, 120 × 80 × 35 mm.", 120, 80, 35),
  box("studio-voucher-box", "Voucher gift box", "Slim box with a sliding, engraved lid for vouchers and small gifts, 130 × 90 × 22 mm.", 130, 90, 22, "sliding", mark("For you")),
  drawer("studio-sample-sleeve", "Craft sample box", "Drawer box for a craft sample pack, 110 × 70 × 30 mm.", 110, 70, 30),

  // gift boxes with a lift-off lid (were two-piece cartons)
  box("jewelry-6x6x3", "Jewellery gift box 6×6×3", `Lift-off lid with a lip, ${s(60, 60, 30)}.`, 60, 60, 30, "liftoff"),
  box("ring-box", "Ring box", `Small box with a lift-off lid, ${s(50, 50, 40)}.`, 50, 50, 40, "liftoff"),
  box("watch-box", "Watch box", `Lift-off lid, engraved, ${s(110, 80, 70)}.`, 110, 80, 70, "liftoff", mark("Time")),
  box("cupcake-box", "Cupcake box", `One cupcake under a lift-off lid, ${s(100, 100, 90)}.`, 100, 100, 90, "liftoff"),
  box("cookie-box", "Cookie box", `Flat box with a lift-off lid, ${s(150, 150, 50)}.`, 150, 150, 50, "liftoff", mark("Cookies")),
  box("chocolate-box", "Chocolate box", `Shallow box for a chocolate tray, ${s(180, 120, 30)}.`, 180, 120, 30, "liftoff"),
  box("nowruz-gift", "Nowruz gift box", `Square gift box with a lift-off lid, ${s(120, 120, 60)}.`, 120, 120, 60, "liftoff"),
  box("shirt-box", "Shirt box", `Large flat box with a lift-off lid, ${s(300, 220, 50)}.`, 300, 220, 50, "liftoff"),
  box("phone-box", "Phone box", `Lift-off lid, for a phone, ${s(160, 80, 25)}.`, 160, 80, 25, "liftoff"),
  box("gift-card-box", "Gift card box", `Slim box with a lift-off lid, ${s(110, 80, 20)}.`, 110, 80, 20, "liftoff"),
  box("cube-favour", "Cube favour box", "Wedding or party favour, a 60 mm cube with a lift-off lid.", 60, 60, 60, "liftoff"),
  box("dice-box", "Dice gift box", "Small 50 mm cube with a lift-off lid.", 50, 50, 50, "liftoff"),
  box("cake-box", "Cake box", `Square box with a lift-off lid, ${s(200, 200, 100)}.`, 200, 200, 100, "liftoff"),
  box("cupcake-bakery", "Four-cupcake box", `Lift-off lid, room for four cupcakes, ${s(180, 180, 90)}.`, 180, 180, 90, "liftoff"),
  box("pastry-box", "Pastry box", `Lift-off lid, ${s(250, 150, 70)}.`, 250, 150, 70, "liftoff"),
  box("pie-box", "Pie box", `Shallow square box with a lift-off lid, ${s(230, 230, 50)}.`, 230, 230, 50, "liftoff"),
  box("tart-box", "Tart box", `Small shallow box with a lift-off lid, ${s(140, 140, 40)}.`, 140, 140, 40, "liftoff"),
  box("rsc-small", "Small shipping crate", `Plain crate with a lift-off lid, ${s(200, 150, 100)}.`, 200, 150, 100, "liftoff"),
  box("fol-carton", "Storage crate", `Strong crate with a lift-off lid, ${s(250, 180, 150)}.`, 250, 180, 150, "liftoff"),
  box("lunch-carry", "Lunch box", `Lift-off lid, ${s(160, 90, 110)}.`, 160, 90, 110, "liftoff"),
  box("open-crate", "Open-top crate", `Crate open on top, ${s(300, 200, 120)}.`, 300, 200, 120, "open"),

  // product boxes with a sliding lid (were tuck-end, snap-lock, auto-bottom and hanging cartons)
  box("soap-box", "Soap box", `Sliding lid with a finger notch, ${s(90, 60, 30)}.`, 90, 60, 30, "sliding", mark("Soap")),
  box("tea-box", "Tea box", `Tall box with a sliding lid on top, ${s(70, 70, 120)}.`, 70, 70, 120, "sliding", mark("Tea")),
  box("candle-box", "Candle box", `For a jar candle, sliding lid, ${s(85, 85, 100)}.`, 85, 85, 100, "sliding"),
  box("perfume-box", "Perfume box", `Tall box with a sliding lid, ${s(55, 55, 130)}.`, 55, 55, 130, "sliding"),
  box("cream-jar-box", "Cream jar box", `Cube box for a cosmetic jar, sliding lid, ${s(60, 60, 60)}.`, 60, 60, 60, "sliding"),
  box("lipstick-box", "Lipstick box", `Slim tall box with a sliding lid, ${s(25, 25, 85)}.`, 25, 25, 85, "sliding"),
  box("business-card-box", "Business card box", `Holds about 100 cards, sliding lid, ${s(92, 57, 25)}.`, 92, 57, 25, "sliding"),
  box("playing-card-box", "Playing card box", `Fits a poker deck, sliding lid, ${s(92, 66, 22)}.`, 92, 66, 22, "sliding"),
  box("pharmacy-box", "Remedy box", `Sliding lid, ${s(100, 80, 30)}.`, 100, 80, 30, "sliding"),
  box("toothpaste-box", "Long product box", `Long box with a sliding lid, ${s(180, 40, 35)}.`, 180, 40, 35, "sliding"),
  box("bulb-box", "Light bulb box", `Square box with a sliding lid, ${s(65, 65, 110)}.`, 65, 65, 110, "sliding"),
  box("mug-box", "Mug box", `Sliding lid, for a mug, ${s(100, 100, 110)}.`, 100, 100, 110, "sliding"),
  box("jar-box", "Honey jar box", `Sliding lid, ${s(75, 75, 100)}.`, 75, 75, 100, "sliding", mark("Honey")),
  box("bottle-box", "Bottle box", `Lying down with a sliding lid, for a small bottle, ${s(180, 70, 70)}.`, 180, 70, 70, "sliding"),
  box("candle-auto-box", "Candle gift box", `Sliding, engraved lid, ${s(85, 85, 100)}.`, 85, 85, 100, "sliding", mark("Light")),
  box("window-cookie-box", "Tall cookie box", `Sliding lid, ${s(120, 60, 160)}.`, 120, 60, 160, "sliding"),
  box("earbuds-box", "Earbuds box", `Small box with a sliding lid, ${s(70, 30, 100)}.`, 70, 30, 100, "sliding"),
  box("toy-box-window", "Toy box", `Sliding lid, ${s(90, 40, 140)}.`, 90, 40, 140, "sliding"),
  box("cd-sleeve", "CD box", "Flat box for a CD or photos, sliding lid, 130 × 130 × 22 mm inside.", 130, 130, 22, "sliding"),
  box("voucher-envelope", "Voucher box", "Flat box for a gift voucher, sliding lid, 175 × 95 × 22 mm inside.", 175, 95, 22, "sliding", mark("Gift")),

  // boxes with a pin-hinged lid (were mailers, clamshells and hinged-lid cartons)
  box("small-mailer", "Small hinged box", `Pin-hinged lid, ${s(150, 100, 50)}.`, 150, 100, 50, "pin"),
  box("book-mailer", "Book box", `Flat box with a pin-hinged lid, for a book, ${s(240, 170, 40)}.`, 240, 170, 40, "pin"),
  box("subscription-box", "Subscription box", `Pin-hinged lid, engraved, ${s(250, 200, 80)}.`, 250, 200, 80, "pin", mark("Thank you")),
  box("tshirt-mailer", "T-shirt box", `Shallow box with a pin-hinged lid, ${s(280, 220, 40)}.`, 280, 220, 40, "pin"),
  box("jewelry-mailer", "Jewellery hinged box", `Small pin-hinged box, ${s(120, 120, 40)}.`, 120, 120, 40, "pin"),
  box("cosmetics-mailer", "Cosmetics set box", `Pin-hinged lid, ${s(200, 150, 70)}.`, 200, 150, 70, "pin"),
  box("pizza-box", "Serving box", `Flat square box with a pin-hinged lid, ${s(300, 300, 40)}.`, 300, 300, 40, "pin"),
  box("burger-box", "Snack box", `Pin-hinged lid, ${s(120, 120, 80)}.`, 120, 120, 80, "pin"),
  box("sandwich-clamshell", "Sandwich box", `Long box with a pin-hinged lid, ${s(180, 100, 70)}.`, 180, 100, 70, "pin"),
  box("tea-hinged", "Tea gift box", `Pin-hinged lid, engraved, ${s(160, 110, 60)}.`, 160, 110, 60, "pin", mark("Tea")),
  box("jewelry-hinged", "Jewellery box, hinged lid", `Pin-hinged lid and a finger notch, ${s(100, 80, 40)}.`, 100, 80, 40, "pin"),
  box("cosmetics-hinged", "Cosmetics box, hinged lid", `Pin-hinged lid, ${s(200, 140, 60)}.`, 200, 140, 60, "pin"),

  // drawer boxes (were drawer cartons and sleeves)
  drawer("matchbox", "Matchbox", "The smallest wooden drawer box, 60 × 50 × 30 mm.", 55, 35, 15),
  drawer("jewelry-drawer", "Jewellery drawer box", "Sliding drawer for jewellery, 100 × 70 × 30 mm.", 100, 70, 30),
  drawer("chocolate-drawer", "Chocolate drawer box", "Drawer box, 160 × 110 × 30 mm.", 160, 110, 30),
  drawer("soap-sleeve", "Soap drawer box", "A wooden sleeve with a drawer for a bar of soap, 90 × 60 × 30 mm.", 90, 60, 30),
  drawer("cookie-sleeve", "Cookie drawer box", "Sleeve and drawer, 160 × 120 × 40 mm.", 160, 120, 40),

  // trays
  tray("hamper-tray", "Hamper tray", `Open tray for a gift hamper, ${s(250, 180, 60)}.`, 250, 180, 60),
  tray("sorting-tray", "Sorting tray", `Shallow desk tray, ${s(150, 100, 30)}.`, 150, 100, 30),
  tray("counter-display", "Counter display tray", `Shop counter tray with three compartments, ${s(220, 160, 90)}.`, 220, 160, 90, 3, 1),
  tray("candy-display", "Candy display tray", `Small counter tray, 2 × 2 compartments, ${s(180, 120, 70)}.`, 180, 120, 70, 2, 2),
  tray("wine-2", "Two-bottle wine box", "Two bottles lying side by side under a sliding lid, 340 × 200 × 100 mm inside.", 340, 200, 100, 1, 2, "sliding"),

  // hexagon boxes
  hex("hex-candle-box", "Hexagon candle box", "Six-sided box with a lift-off lid, 78 mm across and 110 mm deep.", 45, 110),
  hex("hex-favour-box", "Hexagon favour box", "Little hexagon box with a lift-off lid, 52 mm across and 60 mm deep.", 30, 60),

  // divider inserts
  insert("ornament-insert", "Ornament cell insert", "Six cells for baubles in a 240 × 160 mm box, 70 mm tall.", 240, 160, 70, 3, 2),
  insert("jar-insert", "Jar divider insert", "Four cells for jars in a 160 × 160 mm box, 80 mm tall.", 160, 160, 80, 2, 2),
];
