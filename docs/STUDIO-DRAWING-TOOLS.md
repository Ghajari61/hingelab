# Studio drawing tools against a full desktop vector suite

Studio's tools were checked against the toolbox of a common desktop vector suite (CorelDRAW), using its public help pages (*Exploring the toolbox*, *Workspace tools*). Every tool was written for HingeLab from those descriptions of what it does. No code, files, icons or artwork of that program were used, and HingeLab's own names are used throughout.

Status: **Yes**: in Studio. **New**: added in this release. **Not for laser**: deliberately left out, because it changes only how things look on screen or in print, and nothing a laser cuts, scores or engraves.

| Suite's tool | In HingeLab Studio | Status |
|---|---|---|
| Pick, Freehand pick | Selection, Lasso | Yes |
| Free Transform | Rotate, Scale, Reflect, Shear | Yes |
| Shape | Direct Selection (nodes) | Yes |
| Smooth brush | Tweak ▸ Smooth paths | New |
| Smudge, Smear | Tweak ▸ Push paths | Yes |
| Twirl, Attract / Repel | Tweak ▸ Twirl, Attract / repel | Yes |
| Roughen brush | Tweak ▸ Roughen, and the Roughen effect | Yes |
| Crop, Knife, Eraser, Virtual segment delete | Crop, Knife, Eraser, Virtual Segment Delete | Yes |
| Zoom, Pan | Zoom, Hand | Yes |
| Freehand, 2-point line, Bézier, Pen | Pencil, Line Segment, Pen | Yes |
| B-spline | Spline | New |
| Polyline | Pen (clicks give corners) | Yes |
| 3-point curve, 3-point rectangle, 3-point ellipse | the same | Yes |
| Smart drawing | Smart Drawing | Yes |
| LiveSketch | Pencil with smoothing, or Smart Drawing | Yes (similar) |
| Artistic media (brush, sprayer, calligraphic, pressure) | Calligraphy, Spray, Taper and Power Stroke effects | Yes |
| Rectangle, Ellipse | Rectangle, Ellipse | Yes |
| Polygon, Star | Polygon, Star | Yes |
| Complex star | Star ▸ Cross (join every n points) | New |
| Graph paper, Table | Grid / Table | Yes |
| Spiral | Spiral | Yes |
| Impact | Burst Lines | New |
| Basic, Arrow, Flowchart, Banner, Callout shapes | Shape Library (34 shapes in five groups) | New |
| Text | Type (point, area, on a path, flowed) | Yes |
| Parallel, Horizontal / Vertical, Angular dimension | Dimension ▸ Parallel, Horizontal, Vertical, Angle | Yes (1.34) |
| Segment dimension | Dimension ▸ Segment | New |
| 3-point callout | Dimension ▸ Callout | New |
| Radius, diameter | Dimension ▸ Radius, Diameter | Yes (1.34) |
| Straight and right-angle connectors | Connector ▸ Straight, Right-angled | Yes |
| Right-angle round connector | Connector ▸ Rounded | New |
| Blend | Interpolate effect | Yes |
| Contour | Path ▸ Contour | Yes |
| Distort (push / pull, zipper, twister) | Distort effect | Yes |
| Envelope | Envelope effect | Yes |
| Extrude | Depth effect (side edges and back face as lines) | New |
| Block shadow | Solid Shadow effect | New |
| Symmetry drawing | Kaleidoscope effect | Yes (1.34) |
| Drop shadow | — | Not for laser (a soft raster shadow) |
| Transparency | — | Not for laser |
| Interactive fill, Mesh fill | — | Not for laser (colour fills). Engrave fills use the Fill cut layer and Hatches |
| Smart fill | Fill Bounded Area | Yes |
| Color eyedropper, Attributes eyedropper | Eyedropper (Shift+click also copies Live Effects) | Yes / New |
| Outline pen, Edit fill dialogs | Cut layers (cut, score, engrave) and the layer panel | Yes |
| Print merge | File ▸ Fill from Table | Yes (1.34) |
| Step and repeat | Object ▸ Step and Repeat | Yes |
| PowerClip | Object ▸ Clipping Mask | Yes |
| Weld, Trim, Intersect | Path ▸ Pathfinders (unite, trim, intersect, divide, crop) | Yes |
| Bitmap trace | Trace Bitmap | Yes |
| QR code (barcode tool) | File ▸ Insert QR Code (module styles and eye shapes) | New |

## Not done

- Opening .cdr files.
- A keyboard map and toolbox layout copied from that suite.
- The screen-only effects marked "Not for laser" above.
