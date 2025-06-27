<h1 align="center">
    <img src="https://raw.githubusercontent.com/coldenate/citationista/main/assets/logo.svg" alt="Citationista Logo" height="200px">
</h1>

<h3 align="center">
    📚 Citationista
</h3>
<p align="center">
    <i>Streamlined reference management for RemNote</i>
</p>

<p align="center">
    <a href="https://github.com/coldenate/citationista/stargazers"><img src="https://img.shields.io/github/stars/coldenate/citationista?colorA=363a4f&colorB=b7bdf8&style=for-the-badge" alt="GitHub Stars"></a>
    <a href="https://github.com/coldenate/citationista/issues"><img src="https://img.shields.io/github/issues/coldenate/citationista?colorA=363a4f&colorB=f5a97f&style=for-the-badge" alt="GitHub Issues"></a>
    <a href="https://github.com/coldenate/citationista/contributors"><img src="https://img.shields.io/github/contributors/coldenate/citationista?colorA=363a4f&colorB=a6da95&style=for-the-badge" alt="GitHub Contributors"></a>
</p>

## Overview

Citationista enhances your research workflow by bringing robust citation tools directly into RemNote. Quickly capture sources, manage references, and export formatted bibliographies without leaving your notes.

- **Easy Source Capture** – Use `/source` to attach a link or file.
- **Flexible Export** – Convert citation data into a variety of formats (BibTeX, APA, MLA, and more).
- **Zotero Integration** – Sync your Zotero library, including notes and tags.
- **Independent Citation Management** – Manage citations in RemNote even without Zotero.

## Project Status

### Key Completed Features
- Zodoro note import is fully implemented.
- Tag importing is functional.
- Compatibility with the RemNote Reader is in place.
- Pre-release candidate is nearly ready.

### Major Work Remaining
- Finalization of bidirectional sync framework.
- New citation features, including ad hoc bibliography generation from source links.
- Enhanced in-text citation functionality mirroring the Word extension.
- Improved onboarding and installation documentation.
- UI/UX polish (plugin visuals, onboarding flow, custom icons).
- LaTeX support for all titles.
- Source aggregation compatibility.
- Background sync interval implementation.

## Roadmap

### Core Functionality
- **Bidirectional Sync** – Complete sync between Zodoro and RemNote.
- **Ad Hoc Bibliography Generation** – Generate formatted citations from source links via the omnibar and store them as child Rems.
- **Advanced Citation Integration** – Detect ZITEM references, fetch bibliography entries in the user’s citation style, and offer one-click bibliography auto-completion with document-level updates.

### User Experience & Documentation
- **Installation Instructions** – Clarify and simplify setup steps.
- **Onboarding Experience** – Streamline initial user journey and visuals.
- **Custom Icons** – Replace standard Rem bullets with Zodoro icons.
- **LaTeX Title Support** – Ensure all titles render in LaTeX.
- **Improved Sync Feedback** – Enhance error handling and progress messaging.
- **Source Aggregation Compatibility** – Support source aggregation similar to the Zodoro Clipper extension.
- **Background Sync** – Add configurable sync intervals for background operations.

### Acceptance Criteria
- Accurate detection of ZITEM references.
- Retrieval of correct bibliography data.
- Output formatted according to the user’s citation style.
- Single-click bibliography completion.
- Seamless integration with the writing workflow.

## Bugs and Issues

Please report problems or feature requests via [GitHub Issues](https://github.com/coldenate/citationista/issues). Detailed bug reports are appreciated.

---

<p align="center">
    © 2024 <a href="https://github.com/coldenate" target="_blank">Nathan Solis</a>
</p>
