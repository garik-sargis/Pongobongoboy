// Horizontal camera. Follows the train with look-ahead unless the player pans.

export function createCamera() {
  return { x: 0, follow: true, scale: 1, viewW: 0, viewH: 0, pan: 0 };
}

const PAN_SPEED = 900; // world px per second

export function updateCamera(cam, state, canvasW, canvasH, dt) {
  const world = state.config.world;
  cam.scale = canvasH / world.height;
  cam.viewW = canvasW / cam.scale;
  cam.viewH = world.height;

  if (cam.pan !== 0) {
    cam.follow = false;
    cam.x += cam.pan * PAN_SPEED * dt;
  } else if (cam.follow) {
    // Keep the front of the train at 55% of the view so upcoming track is visible.
    const target = state.train.head - cam.viewW * 0.55;
    cam.x += (target - cam.x) * Math.min(1, dt * 4);
  }
  clampCamera(cam, state);
}

export function clampCamera(cam, state) {
  const min = -200;
  const max = state.level.exitX + 500 - cam.viewW;
  cam.x = Math.max(min, Math.min(Math.max(min, max), cam.x));
}

export function snapCamera(cam, state) {
  cam.follow = true;
  cam.x = state.train.head - cam.viewW * 0.55;
  clampCamera(cam, state);
}

export function screenToWorld(cam, sx, sy) {
  return { x: cam.x + sx / cam.scale, y: sy / cam.scale };
}
