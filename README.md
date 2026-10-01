# Konark Sun Temple - Vision Pro Spatial Experience v4

## Navigation

### Teleport mode
On Apple Vision Pro, Safari uses WebXR's transient-pointer natural input. The browser does not expose continuous gaze hover before a pinch. When a pinch begins, the target ray is created from the user's gaze. This build uses that ray to find a landing surface, shows a landing reticle, and teleports when the pinch is released.

The teleport ray checks the actual Konark model first. Upward-facing surfaces are accepted, so stairs, platforms, and other walkable architectural surfaces can be selected when their mesh geometry is present. If no suitable model surface is hit, the virtual ground plane is used.

### Fly mode
Pinch to aim and release to fly forward through the scene. This is intended for quick aerial/inspection movement.

### Reset
Restores the temple to its initial orientation/position and, when resetting inside XR, places it in front of the current headset view.

### Exit VR
Ends the WebXR session. The system Crown/Home interaction remains available as a safety exit as well.

## Important limitation
Safari on Apple Vision Pro supports immersive WebXR and the transient-pointer gaze/pinch interaction. It does not provide continuous gaze hover data before a pinch, so a browser experience cannot truthfully implement a continuously visible gaze cursor before the pinch. This build uses the supported interaction: pinch starts the gaze target, release commits the navigation.

True passthrough/mixed-reality AR requires a native visionOS/RealityKit application rather than Safari WebXR.

## Run locally

Do not open `index.html` directly. Use:

    python -m http.server 8000

Then open `http://localhost:8000`.

## Vision Pro

Deploy to HTTPS. Open the HTTPS URL in Safari on Apple Vision Pro and enter Immersive Experience.

## Model

The supplied GLTF is used with its original materials/textures. The model is not converted to OBJ.
