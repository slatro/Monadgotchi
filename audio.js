// Monadgotchi Retro 8-bit Audio Synthesizer
// Programmatic chimes using Web Audio API (0kb download footprint)

class RetroAudioEngine {
    constructor() {
        this.ctx = null;
        this.isMuted = localStorage.getItem("monadgotchi_muted") === "true";
    }

    initContext() {
        if (!this.ctx) {
            // Standard AudioContext initialization
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass();
            }
        }
        if (this.ctx && this.ctx.state === "suspended") {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        localStorage.setItem("monadgotchi_muted", this.isMuted ? "true" : "false");
        return this.isMuted;
    }

    // Play a single retro square-wave tone
    playTone(frequency, type, duration, startTimeOffset = 0, volume = 0.1) {
        if (this.isMuted) return;
        this.initContext();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = type || "square"; // Retro sound standard is square/triangle
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime + startTimeOffset);

        // Exponential decay envelope for retro feel
        gainNode.gain.setValueAtTime(volume, this.ctx.currentTime + startTimeOffset);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + startTimeOffset + duration);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + startTimeOffset);
        osc.stop(this.ctx.currentTime + startTimeOffset + duration);
    }

    // Play click/button blip sound
    playClick() {
        this.playTone(880, "square", 0.05, 0, 0.08); // High short A5 beep
    }

    // Ascending arpeggio chime for feeding
    playFeedChime() {
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 - E5 - G5 - C6
        notes.forEach((freq, idx) => {
            this.playTone(freq, "square", 0.15, idx * 0.08, 0.08);
        });
    }

    // Joyful, bouncy melody for playing
    playPlayChime() {
        const notes = [587.33, 880.00, 783.99, 1174.66]; // D5 - A5 - G5 - D6
        notes.forEach((freq, idx) => {
            this.playTone(freq, "square", 0.12, idx * 0.07, 0.08);
        });
    }

    // Dynamic slide sound for washing bubbles
    playCleanChime() {
        if (this.isMuted) return;
        this.initContext();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = "triangle"; // Smooth triangle sweep
        osc.frequency.setValueAtTime(200, this.ctx.currentTime);
        // Sweep frequency up rapidly to simulate bubbles/splashes
        osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.3);

        gainNode.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.3);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    // Triumphant Level-Up Fanfare
    playLevelUpFanfare() {
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98]; // C5 - E5 - G5 - C6 - E6 - G6 arpeggio
        notes.forEach((freq, idx) => {
            this.playTone(freq, "square", 0.2, idx * 0.06, 0.08);
        });
        // Susteined final chord note
        this.playTone(1567.98, "square", 0.5, notes.length * 0.06, 0.08);
    }

    // Descending sad minor melody on death
    playDeathMelody() {
        const notes = [440.00, 392.00, 349.23, 293.66, 220.00]; // A4 - G4 - F4 - D4 - A3
        notes.forEach((freq, idx) => {
            this.playTone(freq, "square", 0.25, idx * 0.18, 0.1);
        });
    }

    // Double beep warning for sickness status alert
    playWarningTone() {
        this.playTone(293.66, "square", 0.15, 0, 0.1);    // D4
        this.playTone(293.66, "square", 0.15, 0.2, 0.1);  // D4
    }
}

// Global instance exports
window.audioManager = new RetroAudioEngine();
