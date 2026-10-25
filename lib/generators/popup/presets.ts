import type {GenPreset} from '../types';
import type {PopupParams} from './params';
export type PopupPreset=GenPreset<PopupParams>&{category:string;tags:string[]};
export const POPUP_PRESETS:PopupPreset[]=[
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
        "tiers": 2
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
        "tiers": 3
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
        "depth": 70
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
        "kind": "linear"
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
        "depth": 15
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
        "ratio": 0.8
      },
      "support": {
        "kind": "cords"
      },
      "name": "Snowflake Bauble"
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
      "name": "Scandinavian Spiral Pendant (E27)"
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
        "kind": "bell"
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
        "kind": "vase"
      },
      "rings": {
        "center": 55
      },
      "extras": {
        "socket": "E27",
        "base": true
      },
      "name": "Table Lamp Shade"
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
      "mode": "hanging",
      "support": {
        "kind": "cords"
      },
      "extras": {
        "plantSeat": true
      },
      "name": "Hanging Plant Holder"
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
        "kind": "pagoda"
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
        "kind": "linear"
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
      "name": "Kids Nursery Mobile"
    }
  }
];
