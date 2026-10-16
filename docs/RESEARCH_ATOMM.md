# Research notes: a public maker platform (15 Oct 2026)

These notes record how one public laser-maker site groups its pages. They are for HingeLab's own information architecture. They are not copy, and nothing here is wording, colour, iconography or layout to reuse. Brand names from that site stay in this research file only. They do not go in the product UI.

Reviewed in a real browser, signed in, desktop width:

- Home
- Creative tools catalogue
- Parametric templates
- Designs (graphics library)
- Creator program
- Developer site (`dev.atomm.com`)
- Creator Center dashboard (earlier the same day)

A phone-width drawer was not opened in this pass. The mobile mockup in `docs/ARCHITECTURE.md` is HingeLab's own drawer, using the same three-group idea, not a trace of their menu.

## Global navigation (desktop)

One top bar. Left: logo, search. Then two clusters.

**Make-style cluster**

- An AI prompt entry (words or a photo, plus short "recipe" starters on the home page).
- A generators catalogue.
- A personal workspace (saved work).

**Community-style cluster**

- User projects (files, materials, steps).
- Parametric templates. The page title claims 580+.
- A graphics library.
- A materials lab, marked new.
- Themed hubs (seasonal collections).

**Further links**

- A paid creator program, badged with a money figure.
- Contests.
- An academy on another site.
- A hardware store on another site.

Account area: publish, language, notifications, messages, avatar. Footer: community rules, terms, privacy, a second terms link, about, blog, and four social networks.

Home, under the prompt, is a row of recipe starters (engrave, cut, vectorise, relief), then a "recommended generators" grid, then a personalised project feed. Counts and prices on that feed were not recorded.

## Generators catalogue

Page title is their own. What matters for us is the shape:

- Search box and a Filters control.
- Process filters seen: ink print, DTF/DTG, UV print, blade cut, 3D, laser cut, engraving, relief.
- Source filter: all / official / community.
- A "Build a tool" entry for outside developers.
- Cards: thumbnail, name, one outcome sentence, author (official or a person), a usage count, and badges (new, hot, update).

The brief expected tabs named All / Laser / Print and a Trending sort. Those exact controls were not in the accessibility tree on this visit. Process checkboxes and an Official/Community source switch were.

Usage counts shown on cards that day (theirs, not ours; do not invent matching numbers for HingeLab): layered cutting 50.9K, halftone 38K, flower 25.1K, name gift 14.6K, silhouette 9K, crochet 8.7K, 3D model 7.8K, stained glass 7.6K, sticker 6.2K, cut ornament 6.1K, photo frame 5.3K, coin 4.3K, QR 4.2K, room sign 3.1K. Several community tools sat under 400 uses (living hinge 278, paper packaging 215, phone stand 369, coaster set 324, name puzzle 164).

Kinds of tool on the first screen, described by job rather than by their sentences: photo-to-3D, halftone, layered map, ornament, AI layered mandala, paper boxes with a folded preview, living hinge on a flat sheet, stencil text with bridges, layered photo cutting, QR, puzzle, clock, key holder, cake topper, coasters plus a stand, phone or tablet stand, name puzzle, stamp layouts. Many are official; many are community-built.

Closest overlap with HingeLab: layered mandala (prompt in, fixed sheet count, 3D stack, SVG out), layered cutting from a photo, and a living-hinge panel. None of those is a fully parametric shadow box with kerf, island checks and machine-independent export.

## Templates

A filterable grid. Categories seen: box, lamp and light, desk organizer, dollhouse furniture, shelf and rack, earring, keychain, cake topper, ornament, door sign, gift-card holder, photo frame, letter logo, wedding sign, tray and bowl, model, puzzle, cutting board, necklace, name sign, card, other.

Each card is a name, an author, and two counts (the second is the larger one on gift boxes, earrings and keychains). On the first screen, a classic lidded gift box showed about 2.1k on the larger count, teardrop earrings about 2k, a wine-bottle gift box about 2.2k. Light boxes on the same screen were lower (about 77 to 257). Those figures are theirs, from one screen, on one day.

The brief's customiser (shared right panel, 3D/2D, mm/inch, Basic size, Advanced thickness and kerf, a kerf test, face settings, a view control, free export, and a "what others made" strip) was not opened in this pass. Treat that panel description as unverified until a template is opened in a later phase.

## Graphics library

Heading "Designs". Filters: design type (editable file, text and lettering, patterns, relief and 3D), process (engraving, cutting, flat print, inner engraving, relief, pen and foil), file format (their native project, SVG, PNG, JPG, GLB, OBJ). Pagination showed 167 pages. This is a stock-art library. HingeLab's Graphics section, if built, stays original artwork only.

## Creator program and developer site

The program page offers three roles: publish projects, publish generators, publish videos. It sells coins, exclusive listings, a materials commission and a premium split, plus a referral link. The creator dashboard (reviewed earlier) shows published / followers / likes / bookmarks / downloads, then content, earnings, a store, locked material and video programs, copyright, contests, and tabs for projects, designs, parametric templates, material settings and generators.

The developer site is a separate host. Its pitch is: one script tag, any stack, local preview, export as one file or a zip, review, then a generated landing page. That is a distribution channel for other people's generators. HingeLab does not join it in this phase. A future "For developers" page can describe our own embed idea in our own words. No credits, no coin economy.

## What HingeLab should take, and what it should not

Take the grouping and the flow:

1. Make something (catalogue, then a template, then your saved work).
2. Browse what other people finished, in collections, plus a small original graphic set and a material reference.
3. Learn (guides, a kerf test, what changed, a developer note).

Do not take their prompt-first home, coin balances, usage-count theatre, official-versus-community split, hardware store, or third-party art library. Do not copy card sentences. HingeLab already has the editors, the plan gates, and a generator contract (`docs/ARCHITECTURE.md`). The next phases add navigation and pages around that, and only add a generator when the current one does not already do the job.
