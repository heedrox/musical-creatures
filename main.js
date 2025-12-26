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
        this.playerCountSelect = document.getElementById('playerCount');
        this.legendEl = document.getElementById('legend');
        this.gameModeToggle = document.getElementById('gameModeToggle');
        this.statusText = document.getElementById('statusText');
        this.energyBar = document.getElementById('energyBar');
        
        const canvas = document.getElementById('frequencyCanvas');
        this.graphRenderer = new GraphRenderer(canvas);
        
        // Modo de detección múltiple (por defecto: 2 frecuencias)
        this.detectMultipleFrequencies = true;
        this.maxFrequencies = parseInt(this.playerCountSelect.value);
        
        // Colores para cada jugador
        this.playerColors = ['#667eea', '#f093fb', '#4facfe', '#00f2fe', '#43e97b'];
        
        // Actualizar leyenda inicial
        this.updateLegend();
        
        // Inicializar toggle de modo juego
        if (this.gameModeToggle) {
            this.gameModeToggle.checked = this.gameMode;
        }
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
            this.playerCountSelect.disabled = true; // Deshabilitar selector durante la ejecución
            
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
        this.playerCountSelect.disabled = false; // Rehabilitar selector
        
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

