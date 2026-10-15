package com.tiltmaze.sensor

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

data class MotionData(
    val pitch: Float,        // Calibrated normalized pitch [-1.0, 1.0]
    val roll: Float,         // Calibrated normalized roll [-1.0, 1.0]
    val yawRate: Float,      // Angular yaw rate
    val shakeTriggered: Boolean,
    val recalibratedPulse: Boolean
)

class MotionSensorManager(context: Context) : SensorEventListener {
    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val rotationSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
        ?: sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val accelSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)

    // One-Euro Filters for jitter-free pitch and roll
    private val pitchFilter = OneEuroFilter(minCutoff = 1.0f, beta = 0.4f)
    private val rollFilter = OneEuroFilter(minCutoff = 1.0f, beta = 0.4f)

    // Quaternion neutral reference for relative orientation
    private var refQuat: FloatArray? = null
    private var recalibratePulse = false

    // Current filtered values
    @Volatile private var currentPitch = 0.0f
    @Volatile private var currentRoll = 0.0f
    @Volatile private var currentYawRate = 0.0f

    // Shake-to-jump detection
    private var lastShakeTime = 0L
    private var shakeFramesRemaining = 0
    private val SHAKE_THRESHOLD_G = 2.15f * 9.81f // ~21.1 m/s^2
    private val SHAKE_DEBOUNCE_MS = 450L
    private val MAX_TILT_DEG = 35.0f
    private val DEADZONE_RAD = 0.04f

    fun start() {
        rotationSensor?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST)
        }
        accelSensor?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST)
        }
    }

    fun stop() {
        sensorManager.unregisterListener(this)
    }

    fun calibrateNeutral() {
        refQuat = null // Reset so next rotation event stores current quat as neutral
        recalibratePulse = true
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        val now = System.currentTimeMillis()

        if (event.sensor.type == Sensor.TYPE_GAME_ROTATION_VECTOR || event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
            val qCurr = FloatArray(4)
            SensorManager.getQuaternionFromVector(qCurr, event.values)

            // Capture neutral reference
            if (refQuat == null) {
                refQuat = qCurr.clone()
            }

            // Calculate relative orientation: q_rel = q_ref^* * q_curr
            val qRef = refQuat!!
            val qRel = quatMultiply(quatConjugate(qRef), qCurr)

            // Convert relative quaternion to Euler angles
            val rotMatrix = FloatArray(9)
            SensorManager.getRotationMatrixFromVector(rotMatrix, floatArrayOf(qRel[1], qRel[2], qRel[3], qRel[0]))

            // Remap coordinate system for landscape orientation (long edge horizontal)
            val remappedRotMatrix = FloatArray(9)
            SensorManager.remapCoordinateSystem(
                rotMatrix,
                SensorManager.AXIS_Y,
                SensorManager.AXIS_MINUS_X,
                remappedRotMatrix
            )

            val orientation = FloatArray(3)
            SensorManager.getOrientation(remappedRotMatrix, orientation)

            var rawPitch = orientation[1]  // Pitch (tilt forward nose-down / nose-up)
            var rawRoll = orientation[2]   // Roll (tilt left / tilt right)

            // Deadzone check
            val radialMag = hypot(rawPitch, rawRoll)
            if (radialMag < DEADZONE_RAD) {
                rawPitch = 0.0f
                rawRoll = 0.0f
            }

            // Normalize to [-1.0, 1.0] clamped to MAX_TILT_DEG
            val maxTiltRad = (MAX_TILT_DEG * Math.PI / 180.0).toFloat()
            val normPitch = max(-1.0f, min(1.0f, rawPitch / maxTiltRad))
            val normRoll = max(-1.0f, min(1.0f, rawRoll / maxTiltRad))

            // Adaptive One Euro Filter
            currentPitch = pitchFilter.filter(normPitch, now)
            currentRoll = rollFilter.filter(normRoll, now)
            currentYawRate = orientation[0]
        } else if (event.sensor.type == Sensor.TYPE_LINEAR_ACCELERATION) {
            val ax = event.values[0]
            val ay = event.values[1]
            val az = event.values[2]
            val magnitude = sqrt(ax * ax + ay * ay + az * az)

            if (magnitude > SHAKE_THRESHOLD_G && (now - lastShakeTime > SHAKE_DEBOUNCE_MS)) {
                lastShakeTime = now
                shakeFramesRemaining = 3 // Active for 3 binary frames
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    fun getCurrentMotionData(): MotionData {
        val isShake = shakeFramesRemaining > 0
        if (shakeFramesRemaining > 0) shakeFramesRemaining--

        val isRecal = recalibratePulse
        recalibratePulse = false

        return MotionData(
            pitch = currentPitch,
            roll = currentRoll,
            yawRate = currentYawRate,
            shakeTriggered = isShake,
            recalibratedPulse = isRecal
        )
    }

    private fun quatConjugate(q: FloatArray): FloatArray {
        // q = [w, x, y, z]
        return floatArrayOf(q[0], -q[1], -q[2], -q[3])
    }

    private fun quatMultiply(q1: FloatArray, q2: FloatArray): FloatArray {
        val w1 = q1[0]; val x1 = q1[1]; val y1 = q1[2]; val z1 = q1[3]
        val w2 = q2[0]; val x2 = q2[1]; val y2 = q2[2]; val z2 = q2[3]

        return floatArrayOf(
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2
        )
    }
}
