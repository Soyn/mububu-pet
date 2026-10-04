# muse-pet

Install guide, what it does, and how to make it your Muse: https://gadget.mububu.app/launch/pet/

A Claude Code mod (v2.1.287+): a pixel Muse that lives above the prompt and earns its place.

- **It watches Claude for you.** When Claude stops to ask (a permission prompt, a question) the Muse waves,
  says what it is waiting on and chimes. When a long turn finishes it hops and chimes. Short turns stay quiet.
- **It carries the meter.** Under its words: the context window as a five-block meter with the percent, and the
  session's cost. As the context fills it gets sleepy and asks for `/compact`.
- **It is yours.** `/muse <id>` loads your own Muse: on gadget.mububu.app, open SHARE → TERMINAL PET; the page
  renders your Muse's pose clips (about ten seconds) and gives you the command. `/muse default` goes back.
- `/pet` pets it (a purr, two hearts). `/pet small` / `/pet big` set its size (24 or 32 pixels; the default is big).
- `/pet mute` silences every chime (for heads-down coding; it still waves). `/pet sound` brings them back. Remembered.

The frames are the real 3D Muse through the Gadget's pixelator, head and shoulders, one clip per pose
(idle, think, wave, cheer, jump, sit, walk), drawn as half-block cells (two pixel rows per terminal row)
in a `Raster`. On the Desktop app, which has no `Raster`, it is a small text face. Sounds are generated
(`scripts/render-pet-sounds.cjs`), as are the default sheets (`scripts/render-pet-sprites.cjs`, from the
gadget's hidden `sprite32bust` / `spritebust` screens); rerun them after the Muse or the pixelator changes.

Published from its own repository, github.com/Soyn/mububu-pet (this folder is the source of truth; copy it
there and bump the version to release). Install:

    claude plugin marketplace add Soyn/mububu-pet
    claude plugin install muse-pet@mububu

Run this folder for one session instead:

    claude --plugin-dir ./mods/muse-pet

Check and test:

    claude plugin validate ./mods/muse-pet
    claude plugin test ./mods/muse-pet

Server side: `POST /api/pet` stores a rendered sheet (worker/index.js `createPet`, validated, a year), and
`GET /p/<id>.json` serves it to the mod.
