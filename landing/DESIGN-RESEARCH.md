# Landing direction: product on a quiet canvas

Research and implementation review: 21 November 2026. These are observations of the live sites at this date, not claims about their original launch designs.

## References inspected

| Reference                                                                                         | Observed design choices                                                                                                                                                                                                                      | Application to YAFFW                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Atlasflow](https://atlasflow.com/)                                                               | White canvas, compact navigation, left-aligned product statement, black primary action, substantial dashboard view. At the inspected 1280px viewport its headline computed to Inter 500, about 72px, 1.03 line height, and −0.04em tracking. | Give the real editor a complete, undistorted frame. State the task directly and make opening the editor obvious.                                 |
| [Indent](https://indent.com/)                                                                     | Short centered proposition, small action pair, pale product frame, monochrome customer marks, product-specific workflow examples. Its first-fold spacing is more restrained than a theatrical full-screen hero.                              | Use a brief explanation and show actual controls next to their meaning. YAFFW uses a left-aligned composition; it has no invented customer band. |
| [Quiver](https://quiver.ai/)                                                                      | Quiet neutral interface around expressive vector output; compact navigation, clear action hierarchy, working product concepts presented at useful scale. More borders, pills, and animation than Atlasflow.                                  | Keep expression inside the media. Do not copy the announcement strip, decorative grid, or generator form into a video editor.                    |
| [Aaron Mahlke](https://www.mahlke.design/)                                                        | Small, functional introduction; signature mark; substantial product-interface studies with little surrounding decoration. His portfolio lists Atlasflow as a personal project and QuiverAI among companies he worked with.                   | Preserve YAFFW's existing gold product mark and let real workbench imagery establish the visual identity. Avoid a new decorative brand system.   |
| [Ruben Hume](https://www.ruben.sh/) and [published identity work](https://dribbble.com/rubenhume) | Compact neutral typography, strong identity marks and controlled contrast. His own portfolio uses a black canvas and an expressive interactive globe of brand work. It is not uniformly quiet or strictly Scandinavian.                      | Borrow optical discipline, intentional grouping, and confident identity presentation. Do not imitate the globe, star field, or identity marks.   |
| [Kargul Studio](https://kargul.studio/)                                                           | Bold neutral composition, deliberate headline measure, clear contrast between text and showcased work. Ruben's portfolio says he leads branding there.                                                                                       | Use distinct page chapters and consistent framing. Studio-wide work is not attributed wholesale to Ruben.                                        |

The user's attribution of Indent to Aaron is a supplied reference. Aaron's portfolio confirms relationships with Atlasflow and Quiver, but does not establish sole authorship of every part of every inspected site. Kargul is used as studio context, not as a claim that Ruben designed every page or project there.

## Design inference

The common ground is precise product presentation: a neutral surround, deliberate type scale, concise explanation, and imagery that explains something real. The Scandinavian skill is useful for that restraint, but it is not a complete description of either designer's work. Their expressive branding is a choice, not something to flatten indiscriminately.

YAFFW's old composition placed a real screenshot beside an enormous hero and followed it with a second, simulated editor and several animated mockups. That made multiple depictions compete and obscured which interface someone would actually open.

The new hierarchy is:

1. A literal product statement and primary action, followed by the complete current editor.
2. The open → select → review/download workflow, with a readable crop of the real Selection surface.
3. An explicit local-processing explanation.
4. Real Audio and Export panel captures, followed by layout, presets, and preview details.
5. Optional control references, current limitations, planned capabilities, source commands, and footer navigation.

## Implementation decisions

- Use Inter for the landing's main typography, following the user's preference and the live Atlasflow/Indent references. Keep Geist Mono for code and media-time readouts.
- White and achromatic neutral chrome; all authored values remain OKLCH. The gold mark, selected range, playhead, and meter colors remain in real product imagery and the scoped control examples.
- Medium-weight headings, a simple size ladder, 8px control radii, and consistent primary actions.
- Remove the warm wash, lit edges, floating shadows, pointer lights, generated feature panels, and perpetual illustration loops.
- Capture the running editor with the repository's existing sample media. The hero and detail views are screenshots, not interactive controls. The editor itself remains a separate destination.
- Keep both existing timeline interactions, but label the Selection simulation and make it optional. Its disclosure stops playback and cancels an unfinished gesture when closed, using the existing disclosure-aware timeline behavior. Keyboard help stays in its own native disclosure.
- Preserve current browser, memory, precision, single-file, and refresh limitations. No new performance or export-accuracy claims.

These are adaptations to YAFFW's purpose, not reproductions of another site's layout, assets, or copy.

The light workbench imagery is captured from the actual editor using its Light appearance. The native Appearance selector offers Light, Dark, and System; Dark remains the app default. The optional landing control examples use the same light workbench tokens. Theme changes repaint waveform canvases without remounting the media player.
