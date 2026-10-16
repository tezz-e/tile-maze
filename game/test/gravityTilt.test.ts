import { describe, it, expect } from 'vitest';
import { computeCalibNeutral, extractLocalGripTilt } from '../src/input/gravityTilt.js';

describe('Local-Grip Gravity-Relative Tilt Math', () => {
  // Propped pose: phone held in landscape, tilted up 55° from desk
  const proppedAngleRad = (55.0 * Math.PI) / 180.0;
  // World up in screen coordinates when propped:
  const proppedUpVector: [number, number, number] = [
    0,
    -Math.sin(proppedAngleRad),
    Math.cos(proppedAngleRad),
  ];

  it('(a) a neutral at a propped pose gives (0, 0) tilt', () => {
    const calib = computeCalibNeutral(proppedUpVector);
    const tilt = extractLocalGripTilt(proppedUpVector, calib);

    expect(tilt.deltaRoll).toBeCloseTo(0, 5);
    expect(tilt.deltaPitch).toBeCloseTo(0, 5);
    expect(Math.abs(tilt.normRoll)).toBeLessThan(1e-6);
    expect(Math.abs(tilt.normPitch)).toBeLessThan(1e-6);
  });

  it('(b) a 10° rotation about the roll axis gives ~10° roll and ~0 pitch', () => {
    const calib = computeCalibNeutral(proppedUpVector);
    const angle10Deg = (10.0 * Math.PI) / 180.0;

    // In local hand frame, rolling phone right by 10°:
    // gx = -sin(10°), gyLocal = 0, gzLocal = cos(10°)
    // Un-rotate sagittal plane back to screen frame:
    // gy = gyLocal * cos(-calibPitchAngle) + gzLocal * sin(-calibPitchAngle)
    // gz = -gyLocal * sin(-calibPitchAngle) + gzLocal * cos(-calibPitchAngle)
    const cosA = Math.cos(calib.calibPitchAngle);
    const sinA = Math.sin(calib.calibPitchAngle);
    const gx = -Math.sin(angle10Deg);
    const gyLocal = 0;
    const gzLocal = Math.cos(angle10Deg);

    const gy = gyLocal * cosA - gzLocal * sinA;
    const gz = gyLocal * sinA + gzLocal * cosA;

    const tilt = extractLocalGripTilt([gx, gy, gz], calib);

    const rollDeg = (tilt.deltaRoll * 180.0) / Math.PI;
    const pitchDeg = (tilt.deltaPitch * 180.0) / Math.PI;

    expect(rollDeg).toBeCloseTo(10.0, 2);
    expect(pitchDeg).toBeCloseTo(0.0, 2);
    expect(tilt.normRoll).toBeGreaterThan(0);
    expect(Math.abs(tilt.normPitch)).toBeLessThan(1e-6);
  });

  it('(b-pitch) a 10° pitch tilt gives ~10° pitch and ~0 roll without cross-coupling', () => {
    const calib = computeCalibNeutral(proppedUpVector);
    const angle10Deg = (10.0 * Math.PI) / 180.0;

    // In local hand frame, pitching nose-down by 10°:
    // gx = 0, gyLocal = -sin(10°), gzLocal = cos(10°)
    const cosA = Math.cos(calib.calibPitchAngle);
    const sinA = Math.sin(calib.calibPitchAngle);
    const gx = 0;
    const gyLocal = -Math.sin(angle10Deg);
    const gzLocal = Math.cos(angle10Deg);

    const gy = gyLocal * cosA - gzLocal * sinA;
    const gz = gyLocal * sinA + gzLocal * cosA;

    const tilt = extractLocalGripTilt([gx, gy, gz], calib);

    const rollDeg = (tilt.deltaRoll * 180.0) / Math.PI;
    const pitchDeg = (tilt.deltaPitch * 180.0) / Math.PI;

    expect(rollDeg).toBeCloseTo(0.0, 2);
    expect(pitchDeg).toBeCloseTo(10.0, 2);
    expect(Math.abs(tilt.normRoll)).toBeLessThan(1e-6);
    expect(tilt.normPitch).toBeGreaterThan(0);
  });

  it('(c) rotating the whole phone about the world vertical axis gives ~0 output', () => {
    const calib = computeCalibNeutral(proppedUpVector);
    const tilt = extractLocalGripTilt(proppedUpVector, calib);

    expect(tilt.deltaRoll).toBeCloseTo(0, 5);
    expect(tilt.deltaPitch).toBeCloseTo(0, 5);
    expect(Math.abs(tilt.normRoll)).toBeLessThan(1e-6);
    expect(Math.abs(tilt.normPitch)).toBeLessThan(1e-6);
  });

  it('(d) works seamlessly at 90° vertical upright without gimbal lock', () => {
    // Upright 90° pose: screen vertical
    const uprightUpVector: [number, number, number] = [0, -1, 0];
    const calib = computeCalibNeutral(uprightUpVector);

    expect((calib.calibPitchAngle * 180.0) / Math.PI).toBeCloseTo(90.0, 2);

    // Neutral at 90° upright gives 0, 0
    const neutralTilt = extractLocalGripTilt(uprightUpVector, calib);
    expect(neutralTilt.deltaRoll).toBeCloseTo(0, 5);
    expect(neutralTilt.deltaPitch).toBeCloseTo(0, 5);

    // 10° roll at 90° upright (turning steering wheel)
    const angle10Deg = (10.0 * Math.PI) / 180.0;
    // At 90° upright, calibPitchAngle = 90°, cosA = 0, sinA = 1
    // gyLocal = 0, gzLocal = cos(10°), gx = -sin(10°)
    // gy = -gzLocal = -cos(10°), gz = gyLocal = 0
    const gx = -Math.sin(angle10Deg);
    const gy = -Math.cos(angle10Deg);
    const gz = 0;

    const rollTilt = extractLocalGripTilt([gx, gy, gz], calib);
    const rollDeg = (rollTilt.deltaRoll * 180.0) / Math.PI;
    const pitchDeg = (rollTilt.deltaPitch * 180.0) / Math.PI;

    expect(rollDeg).toBeCloseTo(10.0, 2);
    expect(pitchDeg).toBeCloseTo(0.0, 2);
    expect(rollTilt.normRoll).toBeGreaterThan(0);
    expect(Math.abs(rollTilt.normPitch)).toBeLessThan(1e-6);
  });
});
