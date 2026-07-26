# Image Composition Module

## Purpose

`imageComposition` owns versioned baked image Contents whose base raster remains
immutable and whose overlays are stored as safe, validated SVG Contents.
It has no Post, Group, publication, or client-specific source dependency.

## Public API

- `POST /v1/user/image-compositions`
- `GET /v1/user/image-compositions/:contentManifestId`
- `POST /v1/user/image-compositions/:contentManifestId/revisions`
- `GET /v1/user/image-compositions` for catalog-placed composition summaries

Create stores standalone Content by default. An optional owned `folderId` uses
the normal file-catalog placement flow. Resolved detail includes
`fileCatalogItemId` only when such a placement exists.

## Identity And Revisions

`ImageCompositionIdentity(userId, compositionId)` converges initial creates and
tracks both the immutable root and current Content rows. Revisions compare and
swap `currentContentId`; if the identity has a catalog placement, the same
transaction advances that FileCatalogItem to the new Content.

Operation records provide durable idempotency and recovery without making a
catalog item mandatory.

## Storage And Safety

- The baked PNG is the default renderable Content and carries the versioned
  semantic recipe in `properties.imageComposition`.
- The base raster and validated SVG stickers are referenced through durable
  `ContentDependency` edges.
- Client-defined SVGs are restricted to a small element and attribute allowlist.
  Passive text presentation values are validated per element and grammar.
- SVGs remain deterministic and self-contained: scripts, event handlers, style
  blocks, CSS functions, external resources, links, filters, masks, and
  clip-paths are rejected.
- Accepted SVGs are stored as raw
  immutable Contents with restrictive serving headers.
- Previews are baked from the final PNG, so ordinary clients show stickers
  without composition-specific preview logic.

## Verification

Primary coverage lives in `test/imageComposition*.test.ts`, including
standalone creation/revision, optional catalog placement, concurrency,
idempotency, dependency integrity, preview generation, and authorization.
