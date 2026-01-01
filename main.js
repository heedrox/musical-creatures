/**
 * Archivo principal - Orquesta todos los módulos
 */
import { AudioCapture } from './audio/audioCapture.js';
import { PitchDetection } from './audio/pitchDetection.js';
import { GraphRenderer } from './visualization/graphRenderer.js';
import { updateCreatureGame, renderCreatureGame, getCreatureState, startGame, resetGame } from './game/creatureGame.js';

class VoicePitchGame {
    constructor() {
        this.audioCapture = new AudioCapture();
        this.pitchDetection = null;
        this.graphRenderer = null;
        this.isRunning = false;
        this.animationFrameId = null;
        this.gameMode = true; // Por defecto activo para MVP
        this.lastFrameTime = null;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusEl = document.getElementById('status');
        this.infoPanel = document.getElementById('infoPanel');
        this.legendEl = document.getElementById('legend');
        this.gameModeToggle = document.getElementById('gameModeToggle');
        this.statusText = document.getElementById('statusText');
        this.energyBar = document.getElementById('energyBar');
        
        const canvas = document.getElementById('frequencyCanvas');
        this.graphRenderer = new GraphRenderer(canvas);
        
        // Inicializar toggle de modo juego
        if (this.gameModeToggle) {
            this.gameModeToggle.checked = this.gameMode;
        }
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.start());
        this.stopBtn.addEventListener('click', () => this.stop());
        
        // Toggle de modo juego
        if (this.gameModeToggle) {
            this.gameModeToggle.addEventListener('change', (e) => {
                this.gameMode = e.target.checked;
                // Mostrar/ocultar display de criatura
                const creatureStatus = document.getElementById('creatureStatus');
                if (creatureStatus) {
                    creatureStatus.style.display = this.gameMode ? 'block' : 'none';
                }
                if (this.isRunning) {
                    // Limpiar canvas al cambiar de modo
                    this.graphRenderer.clear();
                }
            });
        }
        
        // Inicializar visibilidad del display de criatura
        const creatureStatus = document.getElementById('creatureStatus');
        if (creatureStatus) {
            creatureStatus.style.display = this.gameMode ? 'block' : 'none';
        }
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
            
            // Inicializar juego si está en modo juego
            if (this.gameMode) {
                startGame();
            }
            
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
        this.lastFrameTime = null;
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        this.audioCapture.stop();
        this.graphRenderer.clear();
        
        // Limpiar visualización de objetivo
        this.graphRenderer.setTargetFrequency(null);
        this.graphRenderer.setTargetTolerance(null);
        
        // Reiniciar juego si está en modo juego
        if (this.gameMode) {
            resetGame();
        }
        
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        
        this.updateStatus('Captura detenida', 'info');
        this.updateFrequencyDisplays([]);
        
        // Resetear UI de criatura
        if (this.statusText) {
            this.statusText.textContent = 'CALMA 😌';
        }
        if (this.energyBar) {
            this.energyBar.style.width = '90%';
        }
    }

    analyze() {
        if (!this.isRunning) {
            return;
        }

        // Calcular delta time
        const now = performance.now();
        const dt = this.lastFrameTime ? now - this.lastFrameTime : 16.67; // Aproximado para primer frame
        this.lastFrameTime = now;

        // Obtener datos de tiempo para análisis de pitch
        const timeData = this.audioCapture.getTimeData();
        
        if (timeData && this.pitchDetection) {
            // Detectar solo una frecuencia (un solo pitch)
            let frequencies = [];
            const frequency = this.pitchDetection.detectPitch(timeData);
            if (frequency) {
                frequencies = [frequency];
            }
            
            if (this.gameMode) {
                // Modo juego: actualizar criatura (solo si no está en game over)
                const gameState = getCreatureState();
                if (!gameState.isGameOver) {
                    updateCreatureGame(frequencies, dt);
                }
                
                // Actualizar visualización de nota objetivo en el gráfico
                if (gameState.targetFreq !== null) {
                    this.graphRenderer.setTargetFrequency(gameState.targetFreq, gameState.targetNoteName);
                    this.graphRenderer.setTargetTolerance(0.5); // CALM_THRESHOLD en semitonos (actualizado)
                } else {
                    this.graphRenderer.setTargetFrequency(null);
                    this.graphRenderer.setTargetTolerance(null);
                }
                
                // Añadir datos al gráfico y dibujarlo (con la nota objetivo visible)
                this.graphRenderer.addDataPoint(frequencies);
                this.graphRenderer.draw();
                
                // Renderizar criatura encima del gráfico (siempre, incluso en game over para mostrar overlay)
                const ctx = this.graphRenderer.ctx;
                const canvas = this.graphRenderer.canvas;
                renderCreatureGame(ctx, canvas.width, canvas.height);
                
                // Actualizar UI de estado
                this.updateCreatureUI();
            } else {
                // Modo gráfica: limpiar objetivo si estaba activo
                this.graphRenderer.setTargetFrequency(null);
                this.graphRenderer.setTargetTolerance(null);
                
                // Actualizar gráfica normal
                this.graphRenderer.addDataPoint(frequencies);
                this.graphRenderer.draw();
            }
            
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

    updateFrequencyDisplays(frequencies) {
        // Limpiar el panel
        this.infoPanel.innerHTML = '';
        
        const color = '#667eea';
        
        // Crear contenedor (siempre usar el mismo formato)
        const playerInfo = document.createElement('div');
        playerInfo.className = 'player-info';
        playerInfo.style.borderLeft = `4px solid ${color}`;
        
        if (frequencies.length === 0 || !frequencies[0]) {
            // Mostrar estado vacío en el mismo formato
            const freqItem = document.createElement('div');
            freqItem.className = 'info-item';
            freqItem.innerHTML = `
                <span class="label">Frecuencia:</span>
                <span class="value" style="color: ${color};">-- Hz</span>
            `;
            playerInfo.appendChild(freqItem);
            
            const noteItem = document.createElement('div');
            noteItem.className = 'info-item';
            noteItem.innerHTML = `
                <span class="label">Nota:</span>
                <span class="value" style="color: ${color};">--</span>
            `;
            playerInfo.appendChild(noteItem);
        } else {
            // Mostrar la frecuencia detectada
            const frequency = frequencies[0];
            const note = this.pitchDetection.frequencyToNote(frequency);
            
            // Frecuencia
            const freqItem = document.createElement('div');
            freqItem.className = 'info-item';
            freqItem.innerHTML = `
                <span class="label">Frecuencia:</span>
                <span class="value" style="color: ${color};">${Math.round(frequency)} Hz</span>
            `;
            playerInfo.appendChild(freqItem);
            
            // Nota
            const noteItem = document.createElement('div');
            noteItem.className = 'info-item';
            noteItem.innerHTML = `
                <span class="label">Nota:</span>
                <span class="value" style="color: ${color};">${note}</span>
            `;
            playerInfo.appendChild(noteItem);
        }
        
        this.infoPanel.appendChild(playerInfo);
    }

    updateCreatureUI() {
        const creatureState = getCreatureState();
        
        // Actualizar texto de estado
        if (this.statusText) {
            const statusText = creatureState.state === 'CALMA' ? 'CALMA 😌' :
                              creatureState.state === 'INESTABLE' ? 'TENSIÓN 😬' :
                              'CAOS 🤯';
            this.statusText.textContent = statusText;
        }
        
        // Actualizar barra de energía
        if (this.energyBar) {
            const energyPercent = Math.round(creatureState.energy * 100);
            this.energyBar.style.width = `${energyPercent}%`;
            
            // Cambiar color según energía
            if (creatureState.energy > 0.75) {
                this.energyBar.style.backgroundColor = '#4ade80';
            } else if (creatureState.energy > 0.45) {
                this.energyBar.style.backgroundColor = '#fbbf24';
            } else {
                this.energyBar.style.backgroundColor = '#f87171';
            }
        }
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new VoicePitchGame();
});

