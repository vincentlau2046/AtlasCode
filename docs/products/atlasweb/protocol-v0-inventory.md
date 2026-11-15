# Atlas Headless Protocol v0 Inventory

Status: P0 inventory; semantic source remains in the existing AtlasCode kernel/shared schema domain.

This inventory is a boundary document, not a second schema implementation. Generated types and runtime codecs must continue to derive from the existing kernel/shared source.

## Kernel/shared contract

The kernel/shared contract contains UI-neutral facts, inputs, commands, and results:

- **approval request event emission**: the kernel emits a durable request fact with identity, scope, and requested decision data;
- **decision submission**: a consumer submits an allow, deny, or cancellation decision through the kernel command face;
- **diff/deliverable data projection**: the kernel exposes changed-file and deliverable facts as stable data projections;
- **session facts and commands**: list, search, replay, follow, prompt, queue, and cancellation facts/commands;
- generation and replacement semantics for reconnectable projections;
- product-neutral errors and cancellation causes.

The kernel contract does not prescribe a visual component, layout, interaction sequence, or product label. It is consumed by TUI/print, AtlasWeb Code, and at least one non-Code consumer for multi-consumer acceptance.

## Host / renderer interaction

Atlas host and product renderers own interaction and presentation:

- **approval UI** and its product-specific interaction flow;
- **diff review interaction** and review controls;
- **terminal display/interaction** when a product offers that capability;
- layout, focus, navigation, loading/reconnect states, and **product visuals**;
- document-first, chat-first, or canvas-first work surfaces.

These surfaces consume kernel facts and commands but do not move their UI semantics into the shared contract. Office and Comic may implement different interaction flows over the same kernel facts.

## Envelope

Every protocol v0 exchange carries transport-neutral identity and compatibility information:

- `schemaVersion`: logical envelope/schema version;
- `generation`: connection or projection generation used to replace stale state;
- request/response or event discriminator;
- stable request identity and cancellation/error fields where applicable.

The foundation host uses an in-process kernel adapter. The envelope is transport-neutral so a future cross-process adapter can replace the adapter without changing the Web client contract.

## Code-neutral review

Shared schema is **Code-neutral**. Terminal/bash implementation details, Code-only tool concepts, and Code-specific UI state do not enter this inventory's shared declarations. They belong to the AtlasCode bundle and its host/renderer extension.

The Code-neutral review must reject a shared schema change that introduces a concept that AtlasOffice or AtlasComic cannot interpret without importing Code-only implementation.

## Multi-consumer acceptance

S6 headless acceptance requires evidence from:

1. TUI/print;
2. AtlasWeb Code;
3. at least one non-Code consumer, with AtlasOffice as the first planned third consumer.

A consumer proves contract use by consuming the shared facts/commands and passing the kernel boundary scanner. It does not prove acceptance by duplicating a schema or reading a product data directory.

## State source and process boundary

The Atlas host must access product state through the product kernel headless contract. It must not directly read `~/.atlas`, `~/.atlas-office`, or `~/.atlas-comic`. Foundation runs the host and product kernel instance in one service process while keeping the protocol envelope transport-neutral; a future cross-process product adapter must preserve the same contract.

## Config domains

Product configuration domains are separate and recorded in the family manifest:

| Product | `configDirName` |
|---|---|
| AtlasCode | `~/.atlas` |
| AtlasOffice | `~/.atlas-office` |
| AtlasComic | `~/.atlas-comic` |
