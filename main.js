/**
 * Archivo principal - Orquesta todos los módulos
 */
import { AudioCapture } from './audio/audioCapture.js';
import { PitchDetection } from './audio/pitchDetection.js';
import { GraphRenderer } from './visualization/graphRenderer.js';

class VoicePitchGame {
    constructor() {
        this.audioCapture = new AudioCapture();
        this.pitchDetection = null;
        this.graphRenderer = null;
        this.isRunning = false;
        this.animationFrameId = null;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusEl = document.getElementById('status');
        this.infoPanel = document.getElementById('infoPanel');
        this.playerCountSelect = document.getElementById('playerCount');
        this.legendEl = document.getElementById('legend');
        
        const canvas = document.getElementById('frequencyCanvas');
        this.graphRenderer = new GraphRenderer(canvas);
        
        // Modo de detección múltiple (por defecto: 2 frecuencias)
        this.detectMultipleFrequencies = true;
        this.maxFrequencies = parseInt(this.playerCountSelect.value);
        
        // Colores para cada jugador
        this.playerColors = ['#667eea', '#f093fb', '#4facfe', '#00f2fe', '#43e97b'];
        
        // Actualizar leyenda inicial
        this.updateLegend();
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.start());
        this.stopBtn.addEventListener('click', () => this.stop());
        
        // Actualizar número de frecuencias cuando cambia el selector
        this.playerCountSelect.addEventListener('change', () => {
            this.maxFrequencies = parseInt(this.playerCountSelect.value);
            this.updateLegend();
            
            // Si está corriendo, limpiar la gráfica para empezar de nuevo
            if (this.isRunning) {
                this.graphRenderer.clear();
            }
        });
    }

    async start() {
        try {
            this.updateStatus('Inicializando micrófono...', 'info');
            
            const result = await this.audioCapture.initialize();
            
            if (!result.success) {
                this.updateStatus(`Error: ${result.error}`, 'error');
                return;
            }

            // Inicializar detector de pitch con la frecuencia de muestreo correcta
            const sampleRate = this.audioCapture.getSampleRate();
            this.pitchDetection = new PitchDetection(sampleRate);
            
            this.isRunning = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.playerCountSelect.disabled = true; // Deshabilitar selector durante la ejecución
            
            this.updateStatus('🎤 Canta y observa tu frecuencia en tiempo real', 'success');
            
            // Iniciar loop de análisis
            this.analyze();
            
        } catch (error) {
            console.error('Error al iniciar:', error);
            this.updateStatus(`Error: ${error.message}`, 'error');
        }
    }

    stop() {
        this.isRunning = false;
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        this.audioCapture.stop();
        this.graphRenderer.clear();
        
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.playerCountSelect.disabled = false; // Rehabilitar selector
        
        this.updateStatus('Captura detenida', 'info');
        this.updateFrequencyDisplays([]);
    }

    analyze() {
        if (!this.isRunning) {
            return;
        }

        // Obtener datos de tiempo y frecuencia para análisis de pitch
        const timeData = this.audioCapture.getTimeData();
        const frequencyData = this.audioCapture.getFrequencyDataMagnitude(); // Usar magnitud, no dB
        
        if (timeData && this.pitchDetection) {
            let frequencies = [];
            
            if (this.detectMultipleFrequencies) {
                // Detectar múltiples frecuencias (pasar también datos de frecuencia para mejor detección)
                frequencies = this.pitchDetection.detectMultiplePitches(timeData, this.maxFrequencies, frequencyData);
            } else {
                // Detectar solo una frecuencia
                const frequency = this.pitchDetection.detectPitch(timeData);
                if (frequency) {
                    frequencies = [frequency];
                }
            }
            
            // Actualizar gráfica
            this.graphRenderer.addDataPoint(frequencies);
            this.graphRenderer.draw();
            
            // Actualizar displays (mostrar todas las frecuencias detectadas)
            this.updateFrequencyDisplays(frequencies);
        }
        
        // Continuar el loop
        this.animationFrameId = requestAnimationFrame(() => this.analyze());
    }

    updateStatus(message, type = 'info') {
        this.statusEl.innerHTML = `<p>${message}</p>`;
        
        // Cambiar color según el tipo
        this.statusEl.className = 'status';
        if (type === 'error') {
            this.statusEl.style.background = '#fee';
            this.statusEl.style.color = '#c33';
        } else if (type === 'success') {
            this.statusEl.style.background = '#efe';
            this.statusEl.style.color = '#3c3';
        }
    }

    updateLegend() {
        const playerCount = this.maxFrequencies;
        
        // Limpiar leyenda
        this.legendEl.innerHTML = '';
        
        // Añadir solo los jugadores seleccionados
        for (let i = 0; i < playerCount; i++) {
            const p = document.createElement('p');
            p.innerHTML = `<span class="legend-color" style="background: ${this.playerColors[i]};"></span> Jugador ${i + 1}`;
            this.legendEl.appendChild(p);
        }
    }

    updateFrequencyDisplays(frequencies) {
        // Limpiar el panel
        this.infoPanel.innerHTML = '';
        
        if (frequencies.length === 0) {
            // Mostrar estado vacío
            const emptyItem = document.createElement('div');
            emptyItem.className = 'info-item';
            emptyItem.innerHTML = `
                <span class="label">Frecuencia:</span>
                <span class="value">-- Hz</span>
            `;
            this.infoPanel.appendChild(emptyItem);
            
            const emptyNote = document.createElement('div');
            emptyNote.className = 'info-item';
            emptyNote.innerHTML = `
                <span class="label">Nota:</span>
                <span class="value">--</span>
            `;
            this.infoPanel.appendChild(emptyNote);
            return;
        }
        
        // Mostrar cada frecuencia detectada con su color
        frequencies.forEach((frequency, index) => {
            const color = this.playerColors[index % this.playerColors.length];
            const note = this.pitchDetection.frequencyToNote(frequency);
            
            // Crear contenedor para este jugador
            const playerInfo = document.createElement('div');
            playerInfo.className = 'player-info';
            playerInfo.style.borderLeft = `4px solid ${color}`;
            
            // Frecuencia
            const freqItem = document.createElement('div');
            freqItem.className = 'info-item';
            freqItem.innerHTML = `
                <span class="label">Jugador ${index + 1} - Frecuencia:</span>
                <span class="value" style="color: ${color};">${Math.round(frequency)} Hz</span>
            `;
            playerInfo.appendChild(freqItem);
            
            // Nota
            const noteItem = document.createElement('div');
            noteItem.className = 'info-item';
            noteItem.innerHTML = `
                <span class="label">Jugador ${index + 1} - Nota:</span>
                <span class="value" style="color: ${color};">${note}</span>
            `;
            playerInfo.appendChild(noteItem);
            
            this.infoPanel.appendChild(playerInfo);
        });
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new VoicePitchGame();
});

