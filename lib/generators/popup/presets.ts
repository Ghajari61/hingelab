import type {GenPreset} from '../types';
import type {PopupParams} from './params';
export type PopupPreset = GenPreset<PopupParams> & {category:string;tags:string[]};
export const POPUP_PRESETS:PopupPreset[] = [
  {
    "id": "precision-orbit-bowl",
    "name": "Orbit locking bowl",
    "category": "Precision joinery",
    "params": {
      "name": "Orbit locking bowl",
      "outline": {
        "width": 260,
        "height": 260
      },
      "rings": {
        "width": 12,
        "center": 55
      },
      "profile": {
        "kind": "dome",
        "depth": 42
      },
      "support": {
        "ribs": 3
      }
    },
    "note": "Numbered profile ribs with matched ring slots. Measure stock and test the joint coupon before cutting.",
    "pro": true,
    "tags": [
      "precision",
      "matched joints",
      "flat pack"
    ]
  },
  {
    "id": "precision-oval-valet",
    "name": "Oval entry valet",
    "category": "Precision joinery",
    "params": {
      "name": "Oval entry valet",
      "outline": {
        "shape": "ellipse",
        "width": 290,
        "height": 210
      },
      "rings": {
        "width": 12,
        "center": 50
      },
      "profile": {
        "kind": "flat-bottom",
        "depth": 28
      },
      "support": {
        "ribs": 2
      }
    },
    "note": "Numbered profile ribs with matched ring slots. Measure stock and test the joint coupon before cutting.",
    "pro": true,
    "tags": [
      "precision",
      "matched joints",
      "flat pack"
    ]
  },
  {
    "id": "precision-hex-display",
    "name": "Hexagonal display bowl",
    "category": "Precision joinery",
    "params": {
      "name": "Hexagonal display bowl",
      "outline": {
        "shape": "polygon",
        "sides": 6,
        "corner": 8,
        "width": 280,
        "height": 280
      },
      "rings": {
        "width": 14,
        "center": 60
      },
      "profile": {
        "kind": "bell",
        "depth": 48
      },
      "support": {
        "ribs": 3
      }
    },
    "note": "Numbered profile ribs with matched ring slots. Measure stock and test the joint coupon before cutting.",
    "pro": true,
    "tags": [
      "precision",
      "matched joints",
      "flat pack"
    ]
  },
  {
    "id": "precision-petal-centrepiece",
    "name": "Petal centrepiece",
    "category": "Precision joinery",
    "params": {
      "name": "Petal centrepiece",
      "outline": {
        "shape": "flower",
        "petals": 6,
        "petalDepth": 0.1,
        "width": 280,
        "height": 280
      },
      "rings": {
        "width": 13,
        "center": 55
      },
      "profile": {
        "depth": 38
      },
      "support": {
        "ribs": 2
      }
    },
    "note": "Numbered profile ribs with matched ring slots. Measure stock and test the joint coupon before cutting.",
    "pro": true,
    "tags": [
      "precision",
      "matched joints",
      "flat pack"
    ]
  },
  {
    "id": "precision-gallery-tower",
    "name": "Gallery stepped tower",
    "category": "Precision joinery",
    "params": {
      "name": "Gallery stepped tower",
      "mode": "tower",
      "outline": {
        "width": 260,
        "height": 260
      },
      "rings": {
        "width": 14,
        "center": 60
      },
      "profile": {
        "kind": "linear",
        "depth": 145
      },
      "support": {
        "ribs": 4
      }
    },
    "note": "Numbered profile ribs with matched ring slots. Measure stock and test the joint coupon before cutting.",
    "pro": true,
    "tags": [
      "precision",
      "matched joints",
      "flat pack"
    ]
  },
  {
    "id": "precision-soft-square",
    "name": "Soft-square organiser",
    "category": "Precision joinery",
    "params": {
      "name": "Soft-square organiser",
      "outline": {
        "shape": "rounded",
        "width": 250,
        "height": 250,
        "corner": 45
      },
      "rings": {
        "width": 14,
        "center": 60
      },
      "profile": {
        "kind": "flat-bottom",
        "depth": 36
      },
      "support": {
        "ribs": 2
      }
    },
    "note": "Numbered profile ribs with matched ring slots. Measure stock and test the joint coupon before cutting.",
    "pro": true,
    "tags": [
      "precision",
      "matched joints",
      "flat pack"
    ]
  },
  {
    "id": "studio-ripple-bowl",
    "name": "Ripple display bowl",
    "note": "Display object with editable contours and supports; prototype the lift before use. Uses separate, positively located rings on matched profile ribs.",
    "category": "Kitchen & dining",
    "tags": [
      "Kitchen & dining",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "pattern": {
        "kind": "rings",
        "follow": "shape",
        "edge": "wave",
        "amplitude": 1,
        "frequency": 12,
        "arms": 2,
        "segmented": false
      },
      "name": "Ripple display bowl",
      "outline": {
        "width": 220,
        "height": 220
      },
      "profile": {
        "depth": 26
      }
    }
  },
  {
    "id": "studio-polygon-tray",
    "name": "Polygon display tray",
    "note": "Display object with editable contours and supports; prototype the lift before use.",
    "category": "Kitchen & dining",
    "tags": [
      "Kitchen & dining",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "outline": {
        "shape": "polygon",
        "width": 250,
        "height": 250,
        "sides": 8
      },
      "name": "Polygon display tray",
      "profile": {
        "depth": 28
      },
      "rings": {
        "width": 12
      }
    }
  },
  {
    "id": "studio-petal-bowl",
    "name": "Petal catchall",
    "note": "Display object with editable contours and supports; prototype the lift before use.",
    "category": "Kitchen & dining",
    "tags": [
      "Kitchen & dining",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "pattern": {
        "kind": "rings"
      },
      "name": "Petal catchall",
      "outline": {
        "shape": "flower",
        "width": 230,
        "height": 230,
        "petals": 8,
        "petalDepth": 0.08
      },
      "profile": {
        "depth": 28
      }
    }
  },
  {
    "id": "spiral-trivet-bowl",
    "name": "Stepped Trivet Bowl",
    "note": "Kitchen & dining · Editable pop-up design; prototype before use. Uses separate, positively located rings on matched profile ribs.",
    "category": "Kitchen & dining",
    "tags": [
      "Kitchen & dining",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "pattern": {
        "kind": "rings",
        "follow": "shape",
        "edge": "plain",
        "amplitude": 1,
        "frequency": 16,
        "arms": 2,
        "segmented": false
      },
      "name": "Stepped Trivet Bowl"
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
    "name": "Stepped Christmas Tree with Star",
    "note": "Seasonal · Editable pop-up design; prototype before use. Uses separate, positively located rings on matched profile ribs.",
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
        "kind": "rings",
        "follow": "shape",
        "edge": "plain",
        "amplitude": 1,
        "frequency": 16,
        "arms": 2,
        "segmented": false
      },
      "profile": {
        "kind": "linear",
        "depth": 240
      },
      "extras": {
        "finial": "star"
      },
      "name": "Stepped Christmas Tree with Star"
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
    "name": "Layered Ornament (set of 6)",
    "note": "Seasonal · Editable pop-up design; prototype before use. Separate rings with measured suspension heights.",
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
        "kind": "rings"
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
        "copies": 6,
        "nest": "box",
        "calibration": false,
        "labels": false
      },
      "support": {
        "kind": "cords"
      },
      "name": "Layered Ornament (set of 6)"
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
      "rings": {
        "center": 30,
        "rim": 8,
        "width": 6.5
      },
      "support": {
        "kind": "cords"
      },
      "name": "Snowflake Bauble",
      "profile": {
        "depth": 60
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
        "center": 30,
        "rim": 10,
        "width": 10
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
    "name": "Scandinavian Layered Pendant (E27)",
    "note": "Lighting · Editable pop-up design; prototype before use. Separate rings with measured suspension heights.",
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
        "kind": "rings"
      },
      "rings": {
        "center": 80
      },
      "extras": {
        "socket": "E27"
      },
      "support": {
        "kind": "cords"
      },
      "name": "Scandinavian Layered Pendant (E27)",
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
        "center": 80
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
        "center": 80
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
    "name": "Stepped Tealight Holder",
    "note": "Lighting · Editable pop-up design; prototype before use. Uses separate, positively located rings on matched profile ribs.",
    "category": "Lighting",
    "tags": [
      "Lighting",
      "bowl",
      "pop-up"
    ],
    "pro": true,
    "params": {
      "pattern": {
        "kind": "rings",
        "follow": "shape",
        "edge": "plain",
        "amplitude": 1,
        "frequency": 16,
        "arms": 2,
        "segmented": false
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
      "name": "Stepped Tealight Holder"
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
        "center": 70,
        "width": 9
      },
      "profile": {
        "kind": "vase",
        "depth": 150,
        "belly": 0.5,
        "neck": 0.2
      },
      "support": {
        "kind": "ribs",
        "ribs": 3
      },
      "extras": {
        "sleeveDiameter": 55
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
        "names": "Sam\nAlex",
        "mirror": false
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
