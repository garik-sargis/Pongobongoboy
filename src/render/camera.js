// 2D camera. Follows the train (with look-ahead) unless the player pans; mouse wheel zooms.

export function createCamera(config) {
  return {
    x: 0,
    y: 0,
    viewH: config.camera.defaultViewHeight,
    viewW: 0,
    scale: 1,
    follow: true,
    panX: 0,
    panY: 0,
  };
}

export function updateCamera(cam, state, canvasW, canvasH, dt) {
  cam.scale = canvasH / cam.viewH;
  cam.viewW = canvasW / cam.scale;
  const speed = cam.viewH * 1.2; // world units per second

  if (cam.panX || cam.panY) {
    cam.follow = false;
    cam.x += cam.panX * speed * dt;
    cam.y += cam.panY * speed * dt;
  } else if (cam.follow) {
    // Keep the front of the train at 55% of the view so upcoming track is visible.
    const tx = state.train.head - cam.viewW * 0.55;
    const ty = state.world.trackY - cam.viewH / 2;
    const k = Math.min(1, dt * 4);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }
  clampCamera(cam, state);
}

export function clampCamera(cam, state) {
  const minX = -200;
  const maxX = state.world.length + 600 - cam.viewW;
  cam.x = Math.max(minX, Math.min(Math.max(minX, maxX), cam.x));
  const H = state.world.height;
  if (cam.viewH >= H) cam.y = (H - cam.viewH) / 2;
  else cam.y = Math.max(-40, Math.min(H - cam.viewH + 40, cam.y));
}

export function snapCamera(cam, state) {
  cam.follow = true;
  cam.x = state.train.head - cam.viewW * 0.55;
  cam.y = state.world.trackY - cam.viewH / 2;
  clampCamera(cam, state);
}

// Zoom by a factor, keeping the world point under (sx, sy) in place.
export function zoomCamera(cam, state, factor, sx, sy, limits) {
  const before = screenToWorld(cam, sx, sy);
  const canvasW = cam.viewW * cam.scale;
  const canvasH = cam.viewH * cam.scale;
  cam.viewH = Math.max(limits.minViewHeight, Math.min(limits.maxViewHeight, cam.viewH * factor));
  cam.scale = canvasH / cam.viewH;
  cam.viewW = canvasW / cam.scale;
  cam.x = before.x - sx / cam.scale;
  cam.y = before.y - sy / cam.scale;
  cam.follow = false;
  clampCamera(cam, state);
}

export function screenToWorld(cam, sx, sy) {
  return { x: cam.x + sx / cam.scale, y: cam.y + sy / cam.scale };
}
