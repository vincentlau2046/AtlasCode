# AtlasComic lane

## Product shape

AtlasComic is canvas/storyboard-first. Its main work surface is a storyboard/panel canvas with image-generation jobs and an asset library; conversation is an orchestration/control surface.

## Initial Git location

Comic starts as an independent package/lane inside the AtlasWeb repository (`packages/web-comic`). It does not build a second Web shell and does not require an independent repository before its release cadence, owner, CI, size, or contribution model justify a split.

## Contract boundary

Comic consumes the shared kernel/headless contract. The shared contract supplies UI-neutral facts and decisions; Comic host/renderer owns storyboard layout, panel interaction, image-generation job presentation, and product visuals. Code-only terminal/bash concepts do not enter the shared schema.

## Product config

Default product config directory: `~/.atlas-comic`. The family manifest records this value and the host reuse/isolation decision for every cut.

## Evidence

Comic dogfood must prove third-consumer compatibility, Code-neutral shared protocol usage, no direct product-directory reads by host, and no copied platform shell. Rollback uses the exact bundle/repository commit recorded in the family manifest.
