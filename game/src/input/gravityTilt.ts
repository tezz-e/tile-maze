/**
 * Local-Grip Gravity-Relative Tilt Math
 *
 * Implements the yaw-invariant, 3D gravity-relative tilt extraction from MotionSensorManager.kt:
 * - Neutral calibration extracts calibPitchAngle = atan2(-gy0, gz0) and calibRollAngle.
 * - Per-event local-grip tilt extraction rotates sagittal (gy, gz) by calibPitchAngle into local hand frame:
 *   gyLocal = gy * cos(calibPitchAngle) + gz * sin(calibPitchAngle)
 *   gzLocal = -gy * sin(calibPitchAngle) + gz * cos(calibPitchAngle)
 *   deltaPitch = atan2(-gyLocal, gzLocal)
 *   deltaRoll = wrapAngleRad(atan2(-gx, hypot(gyLocal, gzLocal)) - calibRollAngle)
 * - Decoupled pitch and roll, completely immune to compass rotation, with no gimbal lock at 90° upright.
 * - C0-continuous radial deadzone scales smoothly from DEADZONE_RAD to MAX_TILT_RAD.
 */

export interface CalibNeutralState {
  calibPitchAngle: number;
  calibRollAngle: number;
}

export function computeCalibNeutral(avgUpVector: [number, number, number]): CalibNeutralState {
  let [gx0, gy0, gz0] = avgUpVector;
  const g0Len = Math.hypot(Math.hypot(gx0, gy0), gz0);
  if (g0Len > 1e-4) {
    gx0 /= g0Len;
    gy0 /= g0Len;
    gz0 /= g0Len;
  } else {
    gx0 = 0;
    gy0 = 0;
    gz0 = 1;
  }

  const calibPitchAngle = Math.atan2(-gy0, gz0);
  const calibRollAngle = Math.atan2(-gx0, Math.max(1e-4, Math.hypot(gy0, gz0)));

  return { calibPitchAngle, calibRollAngle };
}

export function wrapAngleRad(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2.0 * Math.PI;
  while (a < -Math.PI) a += 2.0 * Math.PI;
  return a;
}

export function extractLocalGripTilt(
  g: [number, number, number],
  calib: CalibNeutralState,
  deadzoneRad: number = 0.025,
  maxTiltRad: number = (30.0 * Math.PI) / 180
): { deltaPitch: number; deltaRoll: number; normPitch: number; normRoll: number } {
  let [gx, gy, gz] = g;
  const gLen = Math.hypot(Math.hypot(gx, gy), gz);
  if (gLen > 1e-4) {
    gx /= gLen;
    gy /= gLen;
    gz /= gLen;
  }

  const cosPitch = Math.cos(calib.calibPitchAngle);
  const sinPitch = Math.sin(calib.calibPitchAngle);

  const gyLocal = gy * cosPitch + gz * sinPitch;
  const gzLocal = -gy * sinPitch + gz * cosPitch;

  const deltaPitch = Math.atan2(-gyLocal, gzLocal);
  const deltaRoll = wrapAngleRad(
    Math.atan2(-gx, Math.max(1e-4, Math.hypot(gyLocal, gzLocal))) - calib.calibRollAngle
  );

  const radialMag = Math.hypot(deltaPitch, deltaRoll);
  let normPitch = 0;
  let normRoll = 0;

  if (radialMag > deadzoneRad) {
    const scale = Math.min(1.0, Math.max(0.0, (radialMag - deadzoneRad) / (maxTiltRad - deadzoneRad))) / radialMag;
    normPitch = Math.max(-1.0, Math.min(1.0, deltaPitch * scale));
    normRoll = Math.max(-1.0, Math.min(1.0, deltaRoll * scale));
  }

  return { deltaPitch, deltaRoll, normPitch, normRoll };
}
