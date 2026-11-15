# AtlasOffice lane

## Product shape

AtlasOffice is document-first. Its main work surface is a document canvas/preview, while conversation is an auxiliary control surface. It contributes an Office bundle, domain controller, renderer, brand/preset contributions, and Office-specific interaction.

## Initial Git location

Office starts as an independent package/lane inside the AtlasWeb repository (`packages/web-office`). It does not build a second Web shell and does not require an independent repository before its release cadence, owner, CI, size, or contribution model justify a split.

## Contract boundary

Office consumes the shared kernel/headless contract. Kernel-side S2 compose and its read-only export/seam analysis are not blocked on AtlasWeb foundation timing. The shared contract supplies UI-neutral facts and decisions; Office host/renderer owns approval UI, diff review interaction, document layout, and product visuals.

## Product config

Default product config directory: `~/.atlas-office`. The family manifest records this value and the host reuse/isolation decision for every cut.

## Evidence

Office dogfood must prove third-consumer compatibility, Code-neutral shared protocol usage, no direct product-directory reads by host, and no copied platform shell. Rollback uses the exact bundle/repository commit recorded in the family manifest.
