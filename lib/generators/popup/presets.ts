import type {GenPreset} from '../types';
import type {PopupParams} from './params';
export type PopupPreset=GenPreset<PopupParams>&{category:string;tags:string[]};
export const POPUP_PRESETS:PopupPreset[]=[
  {"id":"studio-ripple-bowl","name":"Ripple display bowl","note":"Display object with editable contours and supports; prototype the lift before use.","category":"Kitchen & dining","tags":["Kitchen & dining","bowl","pop-up"],"pro":true,"params":{"pattern":{"kind":"spiral","edge":"wave","amplitude":1,"frequency":12},"name":"Ripple display bowl","outline":{"width":220,"height":220},"profile":{"depth":26}}},
  {"id":"studio-polygon-tray","name":"Polygon display tray","note":"Display object with editable contours and supports; prototype the lift before use.","category":"Kitchen & dining","tags":["Kitchen & dining","bowl","pop-up"],"pro":true,"params":{"outline":{"shape":"polygon","width":250,"height":250,"sides":8},"name":"Polygon display tray","profile":{"depth":28},"rings":{"width":12}}},
  {"id":"studio-petal-bowl","name":"Petal catchall","note":"Display object with editable contours and supports; prototype the lift before use.","category":"Kitchen & dining","tags":["Kitchen & dining","bowl","pop-up"],"pro":true,"params":{"pattern":{"kind":"rings"},"name":"Petal catchall","outline":{"shape":"flower","width":230,"height":230,"petals":8,"petalDepth":0.08},"profile":{"depth":28}}},
  {
    "id": "spiral-trivet-bowl",
    "name": "Spiral Trivet Bowl",
    "note": "Kitchen & dining · Editable pop-up design; prototype before use.",
    "category": "Kitchen & dining",
    "tags": [
      "Kitchen & dining",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "pattern": {
        "kind": "spiral"
      },
      "name": "Spiral Trivet Bowl"
    }
  },
  {
    "id": "hexagon-fruit-basket",
    "name": "Hexagon Fruit Basket",
    "note": "Kitchen & dining · Editable pop-up design; prototype before use.",
    "category": "Kitchen & dining",
    "tags": [
      "Kitchen & dining",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "outline": {
        "shape": "polygon"
      },
      "name": "Hexagon Fruit Basket"
    }
  },
  {
    "id": "bread-basket-with-handles",
    "name": "Bread Basket with Handles",
    "note": "Kitchen & dining · Editable pop-up design; prototype before use.",
    "category": "Kitchen & dining",
    "tags": [
      "Kitchen & dining",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "outline": {
        "shape": "ellipse",
        "height": 180
      },
      "extras": {
        "handles": true
      },
      "name": "Bread Basket with Handles"
    }
  },
  {
    "id": "nut-snack-bowl",
    "name": "Nut & Snack Bowl",
    "note": "Kitchen & dining · Editable pop-up design; prototype before use.",
    "category": "Kitchen & dining",
    "tags": [
      "Kitchen & dining",
      "bowl",
      "pop-up"
    ],
    "pro": false,
    "params": {
      "outline": {
        "width": 160,
        "height": 160
      },
      "profile": {
        "depth": 20
      },
      "name": "Nut & Snack Bowl"
    }
  },
  {
    "id": "two-tier-fruit-stand",
    "name": "Two-Tier Fruit Stand",
    "note": "Kitchen & dining · Editable pop-up design; prototype before use.",
    "category": "Kitchen & dining",
    "tags": [
      "Kitchen & dining",
      "tiered",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "tiered",
      "profile": {
        "kind": "pagoda",
        "tiers": 2,
        "depth": 110
      },
      "name": "Two-Tier Fruit Stand"
    }
  },
  {
    "id": "cupcake-tower-3-tiers",
    "name": "Cupcake Tower (3 tiers)",
    "note": "Kitchen & dining · Editable pop-up design; prototype before use.",
    "category": "Kitchen & dining",
    "tags": [
      "Kitchen & dining",
      "tiered",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "tiered",
      "profile": {
        "kind": "pagoda",
        "tiers": 3,
        "depth": 170
      },
      "name": "Cupcake Tower (3 tiers)"
    }
  },
  {
    "id": "spiral-christmas-tree-with-star",
    "name": "Spiral Christmas Tree with Star",
    "note": "Seasonal · Editable pop-up design; prototype before use.",
    "category": "Seasonal",
    "tags": [
      "Seasonal",
      "tower",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "tower",
      "pattern": {
        "kind": "spiral"
      },
      "profile": {
        "kind": "linear",
        "depth": 240
      },
      "extras": {
        "finial": "star"
      },
      "name": "Spiral Christmas Tree with Star"
    }
  },
  {
    "id": "snowflake-tree",
    "name": "Snowflake Tree",
    "note": "Seasonal · Editable pop-up design; prototype before use.",
    "category": "Seasonal",
    "tags": [
      "Seasonal",
      "tower",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "tower",
      "outline": {
        "shape": "snowflake",
        "ratio": 0.75
      },
      "profile": {
        "kind": "linear",
        "depth": 210
      },
      "name": "Snowflake Tree"
    }
  },
  {
    "id": "spiral-ornament-set-of-6",
    "name": "Spiral Ornament (set of 6)",
    "note": "Seasonal · Editable pop-up design; prototype before use.",
    "category": "Seasonal",
    "tags": [
      "Seasonal",
      "hanging",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "hanging",
      "pattern": {
        "kind": "spiral"
      },
      "outline": {
        "width": 100,
        "height": 100
      },
      "rings": {
        "center": 20,
        "rim": 6,
        "width": 5
      },
      "profile": {
        "depth": 50
      },
      "sheet": {
        "copies": 6, "nest": "box", "calibration": false, "labels": false
      },
      "support": {
        "kind": "cords"
      },
      "name": "Spiral Ornament (set of 6)"
    }
  },
  {
    "id": "snowflake-bauble",
    "name": "Snowflake Bauble",
    "note": "Seasonal · Editable pop-up design; prototype before use.",
    "category": "Seasonal",
    "tags": [
      "Seasonal",
      "hanging",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "hanging",
      "outline": {
        "shape": "snowflake",
        "ratio": 0.8,
        "width": 140,
        "height": 140
      },
      "support": {
        "kind": "cords"
      },
      "name": "Snowflake Bauble",
      "profile": {
        "depth": 70
      }
    }
  },
  {
    "id": "halloween-pumpkin-candy-basket",
    "name": "Halloween Pumpkin Candy Basket",
    "note": "Seasonal · Editable pop-up design; prototype before use.",
    "category": "Seasonal",
    "tags": [
      "Seasonal",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "outline": {
        "shape": "pumpkin",
        "petals": 6
      },
      "profile": {
        "kind": "flat-bottom"
      },
      "name": "Halloween Pumpkin Candy Basket"
    }
  },
  {
    "id": "heart-valentine-basket",
    "name": "Heart Valentine Basket",
    "note": "Seasonal · Editable pop-up design; prototype before use.",
    "category": "Seasonal",
    "tags": [
      "Seasonal",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "outline": {
        "shape": "heart"
      },
      "rings": {
        "center": 20,
        "rim": 6,
        "width": 6
      },
      "profile": {
        "depth": 20
      },
      "name": "Heart Valentine Basket"
    }
  },
  {
    "id": "haft-sin-tray-nowruz",
    "name": "Haft-Sin Tray (Nowruz)",
    "note": "Seasonal · Editable pop-up design; prototype before use.",
    "category": "Seasonal",
    "tags": [
      "Seasonal",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "outline": {
        "shape": "rounded"
      },
      "engraving": {
        "text": "نوروز",
        "motif": "nowruz"
      },
      "profile": {
        "depth": 18
      },
      "name": "Haft-Sin Tray (Nowruz)"
    }
  },
  {
    "id": "ramadan-dates-bowl",
    "name": "Ramadan Dates Bowl",
    "note": "Seasonal · Editable pop-up design; prototype before use.",
    "category": "Seasonal",
    "tags": [
      "Seasonal",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "engraving": {
        "motif": "crescent",
        "rim": "رمضان مبارک"
      },
      "name": "Ramadan Dates Bowl"
    }
  },
  {
    "id": "eid-sweets-bowl",
    "name": "Eid Sweets Bowl",
    "note": "Seasonal · Editable pop-up design; prototype before use.",
    "category": "Seasonal",
    "tags": [
      "Seasonal",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "outline": {
        "shape": "flower"
      },
      "engraving": {
        "text": "عید مبارک"
      },
      "name": "Eid Sweets Bowl"
    }
  },
  {
    "id": "scandinavian-spiral-pendant-e27",
    "name": "Scandinavian Spiral Pendant (E27)",
    "note": "Lighting · Editable pop-up design; prototype before use.",
    "category": "Lighting",
    "tags": [
      "Lighting",
      "hanging",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "hanging",
      "pattern": {
        "kind": "spiral"
      },
      "rings": {
        "center": 55
      },
      "extras": {
        "socket": "E27"
      },
      "support": {
        "kind": "cords"
      },
      "name": "Scandinavian Spiral Pendant (E27)",
      "profile": {
        "depth": 200
      }
    }
  },
  {
    "id": "bell-pendant",
    "name": "Bell Pendant",
    "note": "Lighting · Editable pop-up design; prototype before use.",
    "category": "Lighting",
    "tags": [
      "Lighting",
      "hanging",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "hanging",
      "profile": {
        "kind": "bell",
        "depth": 170
      },
      "rings": {
        "center": 55
      },
      "extras": {
        "socket": "E27"
      },
      "support": {
        "kind": "cords"
      },
      "name": "Bell Pendant"
    }
  },
  {
    "id": "table-lamp-shade",
    "name": "Table Lamp Shade",
    "note": "Lighting · Editable pop-up design; prototype before use.",
    "category": "Lighting",
    "tags": [
      "Lighting",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "profile": {
        "kind": "vase",
        "depth": 140
      },
      "rings": {
        "center": 55
      },
      "extras": {
        "socket": "E27"
      },
      "name": "Table Lamp Shade",
      "mode": "hanging",
      "support": {
        "kind": "cords"
      }
    }
  },
  {
    "id": "spiral-tealight-holder",
    "name": "Spiral Tealight Holder",
    "note": "Lighting · Editable pop-up design; prototype before use.",
    "category": "Lighting",
    "tags": [
      "Lighting",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "pattern": {
        "kind": "spiral"
      },
      "rings": {
        "center": 55
      },
      "extras": {
        "tealight": true
      },
      "profile": {
        "depth": 18
      },
      "name": "Spiral Tealight Holder"
    }
  },
  {
    "id": "hanging-plant-holder",
    "name": "Hanging Plant Holder",
    "note": "Home & plants · Editable pop-up design; prototype before use.",
    "category": "Home & plants",
    "tags": [
      "Home & plants",
      "hanging",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "bowl",
      "support": {
        "kind": "cords"
      },
      "extras": {
        "plantSeat": true
      },
      "name": "Hanging Plant Holder",
      "profile": {
        "depth": 100
      }
    }
  },
  {
    "id": "vase-sleeve",
    "name": "Vase Sleeve",
    "note": "Home & plants · Editable pop-up design; prototype before use.",
    "category": "Home & plants",
    "tags": [
      "Home & plants",
      "sleeve",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "sleeve",
      "rings": {
        "center": 70
      },
      "profile": {
        "kind": "vase"
      },
      "name": "Vase Sleeve"
    }
  },
  {
    "id": "pagoda-tower-decor",
    "name": "Pagoda Tower Decor",
    "note": "Home & plants · Editable pop-up design; prototype before use.",
    "category": "Home & plants",
    "tags": [
      "Home & plants",
      "tower",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "tower",
      "profile": {
        "kind": "pagoda",
        "depth": 170,
        "tiers": 5
      },
      "extras": {
        "finial": "point"
      },
      "name": "Pagoda Tower Decor"
    }
  },
  {
    "id": "pyramid",
    "name": "Pyramid",
    "note": "Home & plants · Editable pop-up design; prototype before use.",
    "category": "Home & plants",
    "tags": [
      "Home & plants",
      "tower",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "tower",
      "outline": {
        "shape": "polygon",
        "sides": 4,
        "corner": 0
      },
      "profile": {
        "kind": "linear",
        "depth": 140
      },
      "name": "Pyramid"
    }
  },
  {
    "id": "monogram-key-bowl",
    "name": "Monogram Key Bowl",
    "note": "Gifts & office · Editable pop-up design; prototype before use.",
    "category": "Gifts & office",
    "tags": [
      "Gifts & office",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "engraving": {
        "monogram": "SAM"
      },
      "name": "Monogram Key Bowl"
    }
  },
  {
    "id": "wedding-favour-bowl-names-batch",
    "name": "Wedding Favour Bowl (names, batch)",
    "note": "Gifts & office · Editable pop-up design; prototype before use.",
    "category": "Gifts & office",
    "tags": [
      "Gifts & office",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "engraving": {
        "text": "Sam"
      },
      "job": {
        "names": "Sam\nAlex", "mirror": false
      },
      "name": "Wedding Favour Bowl (names, batch)"
    }
  },
  {
    "id": "mandala-catch-all",
    "name": "Mandala Catch-all",
    "note": "Gifts & office · Editable pop-up design; prototype before use.",
    "category": "Gifts & office",
    "tags": [
      "Gifts & office",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "engraving": {
        "motif": "mandala",
        "fill": true
      },
      "name": "Mandala Catch-all"
    }
  },
  {
    "id": "kids-nursery-mobile",
    "name": "Kids Nursery Mobile",
    "note": "Gifts & office · Editable pop-up design; prototype before use.",
    "category": "Gifts & office",
    "tags": [
      "Gifts & office",
      "hanging",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "mode": "hanging",
      "support": {
        "kind": "cords"
      },
      "engraving": {
        "motif": "stars"
      },
      "sets": {
        "count": 3,
        "scale": 0.6
      },
      "name": "Kids Nursery Mobile",
      "profile": {
        "depth": 110
      }
    }
  }
];
