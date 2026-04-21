# FtheRoads.com - Nostr Road Report Protocol

## Overview

This document defines a custom Nostr event kind for reporting road hazards such as potholes, ditches, obstructions, and other infrastructure issues. Reports are geotagged and stored in Nostr relays for public access.

## Kind 1031: Road Hazard Report

A **regular event** (kind 1031) representing a report of a road hazard or infrastructure issue.

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique identifier for the report (UUID) |
| `g` | Yes | Geohash of the hazard location (for relay-level spatial filtering) |
| `title` | Yes | Short description of the hazard |
| `type` | Yes | Category of the hazard (e.g., `pothole`, `ditch`, `obstruction`, `flooding`, `sign`, `guardrail`, `bridge`, `other`) |
| `severity` | Yes | Severity level: `low`, `medium`, `high`, `critical` |
| `location` | No | Human-readable location description (e.g., "Main St near Oak Ave") |
| `image` | No | URL to a photo of the hazard |
| `district` | No | Road district or jurisdiction name responsible for the road |
| `status` | No | Report status: `open`, `acknowledged`, `fixed` (default: `open`) |
| `alt` | Yes | NIP-31 human-readable description: "Road hazard report" |

### Content

The `content` field contains a freeform description of the hazard, including any additional details the reporter wishes to share.

### Example Event

```json
{
  "kind": 1031,
  "content": "Large pothole approximately 2 feet wide in the right lane. Has been getting worse over the past month. Nearly caused an accident today.",
  "tags": [
    ["d", "550e8400-e29b-41d4-a716-446655440000"],
    ["g", "9yzne"],
    ["title", "Large pothole on Main Street"],
    ["type", "pothole"],
    ["severity", "high"],
    ["location", "Main St near Oak Ave, Richmond, MO"],
    ["image", "https://example.com/pothole-photo.jpg"],
    ["district", "Richmond Road District"],
    ["status", "open"],
    ["alt", "Road hazard report"]
  ]
}
```

### Client Behavior

Clients SHOULD:
- Display reports on a map using the `g` tag geohash for approximate location
- Allow filtering by `type` and `severity` tags
- Show the report status and allow updates
- Support photo attachments via `image` tag or NIP-92 `imeta` tags
- Optionally query external GIS services to determine jurisdiction

### Relay Behavior

Relays SHOULD:
- Index `g` tags for efficient spatial queries
- Index `t` tags for category filtering
- Store these events permanently (regular kind range)
