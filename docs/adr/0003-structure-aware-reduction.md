# ADR 0003: Reduce EPUB structure, not arbitrary bytes

## Status

Accepted

## Context

An EPUB is a ZIP container whose package document, manifest, spine, navigation, XHTML, CSS, and media resources refer to one another. Byte-level deletion usually corrupts the archive before it identifies the structure responsible for a failure.

## Decision

Reduction operates on a normalized publication graph. Transformations remove or simplify whole resources, spine items, DOM regions, navigation entries, metadata fields, and CSS rules. Every accepted transformation must leave a valid candidate and preserve the oracle verdict.

## Consequences

The reducer is more domain-specific than a generic delta debugger, but its history is explainable and its output remains usable by maintainers.
