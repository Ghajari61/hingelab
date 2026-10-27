# Photo to Product: generative parts

- [x] Replace recipe selection with a validated AI-authored part assembly, no product presets or default object.
- [x] Safe arithmetic interpreter, bounded polygons/booleans/repetition, separate manufacturing profiles and 3D poses.
- [x] Same-page 3D, overall and AI-authored parameters, part dimensions/poses/visibility/text and advanced geometry editing.
- [x] Persistence, edit preservation, optional SVG/build exports, old-project compatibility.
- [x] Feature tests and built-Windows-UI browser smoke (explicit model mock); full regression in progress.
- [ ] Production AI verification, Windows 1.16.0 build, merge and publication.

The server uses the existing configured AI provider and authentication. Model data is never executable JavaScript or SVG. Limits: 48 part groups, 160 assembled parts, 24 parameters, 100,000 evaluated vertices and 6,000 profile operations. Expressions permit arithmetic and named math functions only. Output is geometrically checked; absolute dimensions, hidden connections, structural safety and controller compatibility are not established from photos alone. No physical fabrication claim.
