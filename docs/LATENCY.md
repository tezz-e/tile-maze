# Latency Methodology & NTP Synchronization

## 1. NTP 4-Timestamp Clock Synchronization
To determine true network latency and clock skew between the Android phone and the laptop game:

1. **Client sends `NTP_PING`** with timestamp $t_0$ (Client Send Time).
2. **Server receives packet** and records $t_1$ (Server Receive Time).
3. **Server sends `NTP_PONG`** and records $t_2$ (Server Send Time).
4. **Client receives response** and records $t_3$ (Client Receive Time).

### Calculations:
- **Round-Trip Time (RTT):**
  $$\text{RTT} = (t_3 - t_0) - (t_2 - t_1)$$
- **Clock Skew ($\theta$):**
  $$\theta = \frac{(t_1 - t_0) + (t_2 - t_3)}{2}$$
- **One-Way Latency:**
  $$\text{One-Way} \approx \frac{\text{RTT}}{2}$$

## 2. 240fps Slow-Motion Camera Motion-to-Photon Benchmark
To measure true end-to-end motion-to-photon latency (including sensor sampling, Wi-Fi transmit, browser render, and screen scanout):
1. Position the smartphone and the laptop display in the same high-speed camera frame (e.g., iPhone 240fps or Pixel 240fps video mode).
2. Tap "Calibrate Neutral" to center the phone and marble.
3. Rapidly flick the smartphone sideways.
4. Count the number of frames from the exact frame the phone begins physical rotation to the exact frame the 3D board starts tilting on the laptop screen.
5. Compute: $\text{Latency (ms)} = \text{Frame Count} \times \frac{1000}{240} \approx \text{Frame Count} \times 4.16\text{ ms}$.
- Typical result on local Wi-Fi: 6–9 frames ($25\text{ ms} - 37\text{ ms}$).
