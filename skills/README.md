# SlideRule Skill Package

This directory stores the packaged Agent Skill artifact and a partial script mirror.

## Layout

- `sliderule.zip` - The canonical, complete, ready-to-import Skill package. It contains `SKILL.md`, `docs/`, `examples/`, and `scripts/`. Install this artifact.
- `sliderule/` - A partial unpacked mirror containing only validation and fallback `scripts/`. It is not the complete skill and is not ready to install. The zip is canonical.

## Install

The package follows the standard Agent Skills ecosystem format used by `anthropics/skills`. This repo does not expose a repository-root `SKILL.md`, so install from the zip. From the repo root:

```bash
unzip skills/sliderule.zip
```

Or from a clean directory containing the archive:

```bash
unzip sliderule.zip
```

Then drop the resulting `sliderule/` folder into your agent host's skills directory (Trae: Skills · Claude: skill).

Use case: one sentence in -> a reviewable, deliverable spec package out, with every gate actually run by scripts.
