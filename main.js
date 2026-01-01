/**
 * Archivo principal - Orquesta todos los módulos
 */
import { AudioCapture } from './audio/audioCapture.js';
import { PitchDetection } from './audio/pitchDetection.js';
import { GraphRenderer } from './visualization/graphRenderer.js';
import { updateSequenceGame, renderSequenceGame, getSequenceGameState, startSequenceGame, resetSequenceGame } from './game/sequenceGame.js';
import html2canvas from 'html2canvas';

class VoicePitchGame {
    constructor() {
        this.audioCapture = new AudioCapture();
        this.pitchDetection = null;
        this.graphRenderer = null;
        this.isRunning = false;
        this.animationFrameId = null;
        this.lastFrameTime = null;
        
        // Historial completo de frecuencias desde el inicio del juego
        this.fullFrequencyHistory = []; // Array de arrays: [[freq1, freq2], ...]
        this.fullTimeHistory = []; // Array de timestamps relativos al inicio
        this.gameStartTime = null; // Timestamp del inicio del juego
        this.hasReplacedHistoryOnGameOver = false; // Bandera para evitar reemplazar múltiples veces
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.helpBtn = document.getElementById('helpBtn');
        this.helpModal = document.getElementById('helpModal');
        this.statusText = document.getElementById('statusText');
        this.energyBar = document.getElementById('energyBar');
        this.energyBarDesktop = document.getElementById('energyBarDesktop');
        this.lifeValue = document.getElementById('lifeValue');
        this.lifeValueDesktop = document.getElementById('lifeValueDesktop');
        this.timeValue = document.getElementById('timeValue');
        this.creatureStatus = document.getElementById('creatureStatus');
        this.gameOverText = document.getElementById('gameOverText');
        this.gameOverSection = document.querySelector('.game-over-section');
        this.shareBtn = document.getElementById('shareBtn');
        this.container = document.querySelector('.container');
        
        const canvas = document.getElementById('frequencyCanvas');
        this.graphRenderer = new GraphRenderer(canvas);
        
        const creatureCanvas = document.getElementById('creatureCanvas');
        this.creatureCanvas = creatureCanvas;
        this.creatureCtx = creatureCanvas.getContext('2d');
        
        // Configurar tamaño del canvas de criatura
        this.resizeCreatureCanvas();
        window.addEventListener('resize', () => this.resizeCreatureCanvas());
        
        // Forzar redimensionamiento después de que todo esté cargado
        const forceResize = () => {
            this.graphRenderer.resize();
            this.resizeCreatureCanvas();
        };
        
        if (document.readyState === 'loading') {
            window.addEventListener('load', forceResize);
        } else {
            // Si ya está cargado, forzar redimensionamiento después de un pequeño delay
            setTimeout(forceResize, 100);
        }
        
        // También forzar redimensionamiento cuando el DOM esté completamente listo
        requestAnimationFrame(() => {
            requestAnimationFrame(forceResize);
        });
    }
    
    resizeCreatureCanvas() {
        const rect = this.creatureCanvas.getBoundingClientRect();
        this.creatureCanvas.width = rect.width;
        this.creatureCanvas.height = rect.height;
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.start());
        
        // Botón de compartir
        if (this.shareBtn) {
            this.shareBtn.addEventListener('click', () => this.shareGameOver());
        }
        
        // Modal de ayuda
        if (this.helpBtn && this.helpModal) {
            this.helpBtn.addEventListener('click', () => this.openHelpModal());
            
            const closeBtn = this.helpModal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeHelpModal());
            }
            
            // Cerrar al hacer clic fuera del modal
            this.helpModal.addEventListener('click', (e) => {
                if (e.target === this.helpModal) {
                    this.closeHelpModal();
                }
            });
            
            // Cerrar con tecla Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.helpModal.classList.contains('show')) {
                    this.closeHelpModal();
                }
            });
        }
    }
    
    openHelpModal() {
        if (this.helpModal) {
            this.helpModal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    }
    
    closeHelpModal() {
        if (this.helpModal) {
            this.helpModal.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    async start() {
        try {
            // Si el juego ya está corriendo, verificar si podemos reiniciar
            const gameState = getSequenceGameState();
            const isGameOver = gameState.gamePhase === 'GAME_OVER' || gameState.isGameOver;
            
            // Si ya está corriendo y no es Game Over, no hacer nada
            if (this.isRunning && !isGameOver) {
                return;
            }

            // Si es Game Over, reiniciar el juego directamente sin detener el audio
            if (this.isRunning && isGameOver) {
                // Reiniciar juego sin detener el sistema de audio
                const audioContext = this.audioCapture.audioContext || null;
                startSequenceGame(audioContext);
                
                // Resetear historial completo
                this.fullFrequencyHistory = [];
                this.fullTimeHistory = [];
                this.gameStartTime = performance.now();
                this.hasReplacedHistoryOnGameOver = false;
                
                // Limpiar gráfico y visualización
                this.graphRenderer.clear();
                this.graphRenderer.clearTargets();
                
                // Ocultar Game Over
                if (this.gameOverSection) {
                    const gameOverContent = this.gameOverSection.querySelector('.game-over-content');
                    if (gameOverContent) {
                        gameOverContent.classList.remove('show');
                    }
                }
                
                // Deshabilitar botón de nuevo
                this.startBtn.disabled = true;
                
                return;
            }

            // Inicialización normal (primera vez o después de stop)
            const result = await this.audioCapture.initialize();
            
            if (!result.success) {
                console.error('Error al inicializar micrófono:', result.error);
                return;
            }

            // Inicializar detector de pitch con la frecuencia de muestreo correcta
            const sampleRate = this.audioCapture.getSampleRate();
            this.pitchDetection = new PitchDetection(sampleRate);
            
            this.isRunning = true;
            this.startBtn.disabled = true;
            
            // Inicializar juego
            const audioContext = this.audioCapture.audioContext || null;
            startSequenceGame(audioContext);
            
            // Resetear historial completo al iniciar nuevo juego
            this.fullFrequencyHistory = [];
            this.fullTimeHistory = [];
            this.gameStartTime = performance.now();
            this.hasReplacedHistoryOnGameOver = false;
            
            // Iniciar loop de análisis
            this.analyze();
            
        } catch (error) {
            console.error('Error al iniciar:', error);
            // En caso de error, habilitar el botón nuevamente
            if (this.startBtn) {
                this.startBtn.disabled = false;
            }
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
        this.graphRenderer.clearTargets();
        
        // Limpiar historial completo
        this.fullFrequencyHistory = [];
        this.fullTimeHistory = [];
        this.gameStartTime = null;
        this.hasReplacedHistoryOnGameOver = false;
        
        // Reiniciar juego
        resetSequenceGame();
        
        this.startBtn.disabled = false;
        
        // Resetear UI de criatura
        if (this.statusText) {
            this.statusText.textContent = 'CALMA';
        }
        if (this.energyBar) {
            this.energyBar.style.width = '100%';
        }
        if (this.energyBarDesktop) {
            this.energyBarDesktop.style.width = '100%';
        }
        if (this.lifeValue) {
            this.lifeValue.textContent = '100%';
        }
        if (this.lifeValueDesktop) {
            this.lifeValueDesktop.textContent = '100%';
        }
        if (this.timeValue) {
            this.timeValue.textContent = '0.0s';
        }
        
        // Ocultar Game Over
        if (this.gameOverSection) {
            const gameOverContent = this.gameOverSection.querySelector('.game-over-content');
            if (gameOverContent) {
                gameOverContent.classList.remove('show');
            }
        }
        
        // Limpiar canvas de criatura
        if (this.creatureCtx) {
            this.creatureCtx.clearRect(0, 0, this.creatureCanvas.width, this.creatureCanvas.height);
        }
    }

    async shareGameOver() {
        if (!this.container || !this.shareBtn) {
            return;
        }

        // Deshabilitar botón y mostrar estado de carga
        const originalText = this.shareBtn.querySelector('span').textContent;
        const shareIcon = this.shareBtn.querySelector('svg');
        
        this.shareBtn.disabled = true;
        this.shareBtn.querySelector('span').textContent = 'Capturando...';
        
        // Ocultar icono mientras carga
        if (shareIcon) {
            shareIcon.style.opacity = '0.5';
        }

        try {
            // Capturar screenshot del contenedor
            const canvas = await html2canvas(this.container, {
                backgroundColor: '#0a0a0a',
                scale: 2, // Mayor resolución para mejor calidad
                logging: false,
                useCORS: true,
                allowTaint: true
            });

            // Obtener el texto de compartir antes de modificar el canvas
            const gameState = getSequenceGameState();
            const score = gameState.survivalTime ? `${gameState.survivalTime.toFixed(1)}s` : '0.0s';
            const shareText = `¡Conseguí ${score} en Criaturas Musicales! ¿Cuánto puedes conseguir tú? https://musical-creatures.web.app/ 🎵`;

            // Agregar texto directamente en la imagen
            const ctx = canvas.getContext('2d');
            const padding = 40;
            const textHeight = 60;
            
            // Crear un nuevo canvas más grande para incluir el texto
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = canvas.width;
            finalCanvas.height = canvas.height + padding + textHeight;
            const finalCtx = finalCanvas.getContext('2d');
            
            // Dibujar la imagen original
            finalCtx.drawImage(canvas, 0, 0);
            
            // Dibujar fondo semi-transparente para el texto
            finalCtx.fillStyle = 'rgba(10, 10, 10, 0.85)';
            finalCtx.fillRect(0, canvas.height, finalCanvas.width, padding + textHeight);
            
            // Configurar estilo del texto
            finalCtx.fillStyle = '#ffffff';
            finalCtx.font = 'bold 32px "Exo 2", sans-serif';
            finalCtx.textAlign = 'center';
            finalCtx.textBaseline = 'middle';
            
            // Dibujar el texto centrado
            const textY = canvas.height + padding + (textHeight / 2);
            finalCtx.fillText(shareText, finalCanvas.width / 2, textY);

            // Convertir canvas final a blob
            finalCanvas.toBlob(async (blob) => {
                if (!blob) {
                    throw new Error('Error al generar la imagen');
                }

                // Detectar si estamos en móvil y si el navegador soporta Web Share API
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                const supportsShare = navigator.share && navigator.canShare;

                if (isMobile && supportsShare) {
                    // Usar Web Share API en móvil
                    try {
                        const file = new File([blob], 'criaturas-musicales-resultado.png', { type: 'image/png' });
                        
                        if (navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                files: [file],
                                title: 'Criaturas Musicales',
                                text: shareText
                            });
                        } else {
                            // Fallback: compartir solo texto
                            await navigator.share({
                                title: 'Criaturas Musicales',
                                text: shareText
                            });
                        }
                    } catch (error) {
                        if (error.name !== 'AbortError') {
                            // Si el usuario cancela, no mostrar error
                            throw error;
                        }
                    }
                } else {
                    // Desktop: descargar imagen o copiar al portapapeles
                    // Intentar copiar al portapapeles primero
                    try {
                        const clipboardItem = new ClipboardItem({ 'image/png': blob });
                        await navigator.clipboard.write([clipboardItem]);
                        // Mostrar mensaje temporal
                        this.shareBtn.querySelector('span').textContent = '¡Copiado!';
                        setTimeout(() => {
                            this.shareBtn.querySelector('span').textContent = originalText;
                        }, 2000);
                    } catch (clipboardError) {
                        // Fallback: descargar imagen
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `criaturas-musicales-${score}.png`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        
                        this.shareBtn.querySelector('span').textContent = 'Descargado';
                        setTimeout(() => {
                            this.shareBtn.querySelector('span').textContent = originalText;
                        }, 2000);
                    }
                }

                // Restaurar botón
                this.shareBtn.disabled = false;
                this.shareBtn.querySelector('span').textContent = originalText;
                if (shareIcon) {
                    shareIcon.style.opacity = '1';
                }

            }, 'image/png', 0.95);

        } catch (error) {
            console.error('Error al compartir:', error);
            
            // Restaurar botón
            this.shareBtn.disabled = false;
            const errorText = this.shareBtn.querySelector('span');
            errorText.textContent = 'Error';
            if (shareIcon) {
                shareIcon.style.opacity = '1';
            }
            
            // Restaurar texto original después de 2 segundos
            setTimeout(() => {
                errorText.textContent = originalText;
            }, 2000);
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
            // Verificar la fase del juego
            const gameState = getSequenceGameState();
            
            // Solo detectar y visualizar frecuencias durante la fase PLAYING
            if (gameState.gamePhase === 'PLAYING' && !gameState.isGameOver) {
                // Detectar solo una frecuencia (un solo pitch)
                let frequencies = [];
                const frequency = this.pitchDetection.detectPitch(timeData);
                if (frequency) {
                    frequencies = [frequency];
                }
                
                // Registrar en historial completo (desde el inicio)
                if (this.gameStartTime !== null) {
                    const relativeTime = performance.now() - this.gameStartTime;
                    this.fullFrequencyHistory.push(frequencies);
                    this.fullTimeHistory.push(relativeTime);
                }
                
                // Actualizar secuencia
                updateSequenceGame(frequencies, dt);
                
                // Actualizar visualización de notas objetivo en el gráfico
                if (gameState.allTargets && gameState.allTargets.length > 0) {
                    this.graphRenderer.setSequenceTargets(gameState.allTargets);
                    this.graphRenderer.setCurrentTargetIndex(gameState.currentNoteIndex);
                    this.graphRenderer.setTargetTolerance(0.5); // CALM_THRESHOLD en semitonos
                } else {
                    this.graphRenderer.clearTargets();
                }
                
                // Añadir datos al gráfico y dibujarlo (con las notas objetivo visibles)
                this.graphRenderer.addDataPoint(frequencies);
                this.graphRenderer.draw();
            } else {
                // Durante PLAYING_NOTES o COUNTDOWN: no detectar ni visualizar frecuencias del jugador
                // Solo actualizar el juego para avanzar las fases
                updateSequenceGame([], dt);
                
                // Actualizar visualización de notas objetivo en el gráfico
                const currentGameState = getSequenceGameState();
                if (currentGameState.allTargets && currentGameState.allTargets.length > 0) {
                    this.graphRenderer.setSequenceTargets(currentGameState.allTargets);
                    // Durante PLAYING_NOTES, mostrar solo la nota actual que se está reproduciendo
                    // Durante COUNTDOWN, no mostrar ninguna nota resaltada
                    if (currentGameState.gamePhase === 'PLAYING_NOTES' && currentGameState.initialPlaybackNoteIndex >= 0) {
                        this.graphRenderer.setCurrentTargetIndex(currentGameState.initialPlaybackNoteIndex, true); // true = mostrar solo esta nota
                    } else {
                        this.graphRenderer.setCurrentTargetIndex(null, false);
                    }
                    this.graphRenderer.setTargetTolerance(0.5);
                }
                
                // NO añadir datos de frecuencia al gráfico (no mostrar línea del jugador)
                // Solo dibujar el gráfico con las notas objetivo
                this.graphRenderer.draw();
            }
            
            // Renderizar criatura en canvas separado
            this.resizeCreatureCanvas();
            // Limpiar canvas de criatura antes de renderizar
            this.creatureCtx.clearRect(0, 0, this.creatureCanvas.width, this.creatureCanvas.height);
            renderSequenceGame(this.creatureCtx, this.creatureCanvas.width, this.creatureCanvas.height);
            
            // Actualizar UI de estado
            this.updateCreatureUI();
        }
        
        // Continuar el loop
        this.animationFrameId = requestAnimationFrame(() => this.analyze());
    }

    updateCreatureUI() {
        const gameState = getSequenceGameState();
        
        // Detectar Game Over y reemplazar historial del gráfico con toda la historia
        if ((gameState.gamePhase === 'GAME_OVER' || gameState.isGameOver) && 
            this.fullFrequencyHistory.length > 0 && 
            !this.hasReplacedHistoryOnGameOver) {
            // Reemplazar el historial limitado del gráfico con toda la historia completa
            this.graphRenderer.replaceHistory(this.fullFrequencyHistory, this.fullTimeHistory);
            this.hasReplacedHistoryOnGameOver = true; // Marcar como hecho para evitar hacerlo múltiples veces
        }
        
        // Actualizar texto de estado según la fase
        if (this.statusText) {
            if (gameState.gamePhase === 'PLAYING_NOTES') {
                this.statusText.textContent = 'ESCUCHA';
            } else if (gameState.gamePhase === 'COUNTDOWN') {
                // Durante countdown, mostrar "PREPÁRATE" mientras el número grande se muestra en el canvas
                this.statusText.textContent = 'PREPÁRATE';
            } else if (gameState.gamePhase === 'PLAYING') {
                const statusText = gameState.state === 'CALMA' ? 'CALMA' :
                                  gameState.state === 'TENSION' ? 'TENSIÓN' :
                                  'CAOS';
                this.statusText.textContent = statusText;
            } else if (gameState.gamePhase === 'GAME_OVER' || gameState.isGameOver) {
                this.statusText.textContent = 'FIN';
            } else {
                this.statusText.textContent = 'CALMA';
            }
        }
        
        // Actualizar barras de vida
        const updateBar = (bar) => {
            if (!bar) return;
            if (gameState.gamePhase === 'PLAYING') {
                const lifePercent = Math.round(gameState.life * 100);
                bar.style.width = `${lifePercent}%`;
            } else if (gameState.gamePhase === 'GAME_OVER' || gameState.isGameOver) {
                // Cuando el juego termina, mostrar 0%
                bar.style.width = '0%';
            } else {
                bar.style.width = '100%';
            }
        };
        
        updateBar(this.energyBar);
        updateBar(this.energyBarDesktop);
        
        // Actualizar valores de información del juego
        const updateLifeValue = (lifeEl) => {
            if (!lifeEl) return;
            if (gameState.gamePhase === 'PLAYING') {
                lifeEl.textContent = `${Math.round(gameState.life * 100)}%`;
            } else if (gameState.gamePhase === 'GAME_OVER' || gameState.isGameOver) {
                // Cuando el juego termina, mostrar 0%
                lifeEl.textContent = '0%';
            } else {
                lifeEl.textContent = '100%';
            }
        };
        
        updateLifeValue(this.lifeValue);
        updateLifeValue(this.lifeValueDesktop);
        
        if (this.timeValue) {
            if (gameState.gamePhase === 'PLAYING') {
                this.timeValue.textContent = `${gameState.survivalTime.toFixed(1)}s`;
            } else if (gameState.gamePhase === 'GAME_OVER' || gameState.isGameOver) {
                // Cuando el juego termina, mantener la puntuación final
                this.timeValue.textContent = `${gameState.survivalTime.toFixed(1)}s`;
            } else {
                this.timeValue.textContent = '0.0s';
            }
        }
        
        // Mostrar/ocultar Game Over y habilitar botón de iniciar
        if (this.gameOverSection) {
            const gameOverContent = this.gameOverSection.querySelector('.game-over-content');
            if (gameOverContent) {
                if (gameState.gamePhase === 'GAME_OVER' || gameState.isGameOver) {
                    gameOverContent.classList.add('show');
                    // Habilitar botón de iniciar para permitir reiniciar el juego
                    if (this.startBtn) {
                        this.startBtn.disabled = false;
                    }
                } else {
                    gameOverContent.classList.remove('show');
                }
            }
        }
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new VoicePitchGame();
});

