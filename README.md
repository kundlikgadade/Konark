# Konark Sun Temple - Vision Pro Spatial Experience

This is a ready-to-run Three.js + WebXR experience built around the supplied Konark Sun Temple glTF model.

## What is included

- Supplied Konark glTF model and all texture assets
- Full-scale immersive WebXR mode for Apple Vision Pro
- Gaze-directed teleportation: look at the ground to position a live teleport cursor
- Pinch/select to teleport to the exact point you are looking at
- Desktop preview with mouse as a gaze/pinch simulator
- Information panel for each location
- Static-site deployment configuration for GitLab Pages

## Important Vision Pro limitation

Safari on visionOS supports `immersive-vr` WebXR, which is used by this project.

Safari WebXR does **not** provide an `immersive-ar` / camera-passthrough session for this experience. Therefore the browser version intentionally provides a fully immersive temple rather than claiming to provide true passthrough AR.

For a true mixed-reality version where the physical room remains visible and the temple is anchored into it, the next step is a native visionOS/RealityKit application.

## Run on Windows

Do NOT double-click `index.html`. WebGL modules and glTF assets need to be served by a web server.

If Python is installed:

    python -m http.server 8000

Then open:

    http://localhost:8000

The desktop preview should load the temple.

## Test on Apple Vision Pro

WebXR requires HTTPS.

The easiest deployment route is GitLab Pages:

1. Create a GitLab repository.
2. Upload this project.
3. Push the `.gitlab-ci.yml` included here.
4. GitLab Pages will publish an HTTPS URL.
5. Open the URL in Safari on Apple Vision Pro.
6. Tap "Enter Immersive Experience".
7. Accept the Safari permission prompt.
8. Look down at the floor to position the glowing teleport cursor, then pinch to teleport to that exact location.

## Teleport locations

Teleport locations are defined near the top of `app.js` in the `LOCATIONS` array.

Each location has:

- `id`
- `name`
- `short`
- `pos`
- `info`

The `pos` coordinates are based on the supplied model's authored coordinate system.

## If a teleport point needs adjustment

Edit:

    pos:[x, y, z]

in `app.js`.

The model is recentered automatically at runtime.

## Performance

The supplied asset is approximately 22 MB including textures and contains roughly 26 material sections and about 172k triangles. This is a reasonable starting point for a Vision Pro WebXR prototype.

For a polished public exhibition, additional optimization is recommended:

- texture compression
- mesh compression
- LODs
- removal of unseen geometry
- baked lighting where appropriate
- progressive loading

## Next development step

For true mixed reality / passthrough AR, convert this experience into a native visionOS application using RealityKit. The existing GLTF/GLB asset and teleport-location concept can be reused.

## Interaction model

There are intentionally no fixed teleport-location buttons. The teleport target is calculated from the user's current view direction and the navigation floor. On Vision Pro, the natural gaze + pinch input is received as WebXR select input. On desktop, move the mouse over the ground and click to simulate the same action.
