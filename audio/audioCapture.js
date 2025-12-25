/**
 * Módulo de captura de audio del micrófono
 * Maneja la captura de audio y proporciona datos para análisis
 */
export class AudioCapture {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        this.isCapturing = false;
    }

    /**
     * Inicializa la captura de audio
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            // Solicitar acceso al micrófono
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });

            // Crear contexto de audio
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            
            // Configurar el analizador
            this.analyser.fftSize = 2048; // Mayor resolución para mejor detección de pitch
            this.analyser.smoothingTimeConstant = 0.8;
            
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Float32Array(bufferLength);

            // Conectar el micrófono al analizador
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);

            this.isCapturing = true;
            return { success: true };
        } catch (error) {
            console.error('Error al inicializar captura de audio:', error);
            this.isCapturing = false;
            return { 
                success: false, 
                error: error.message || 'No se pudo acceder al micrófono' 
            };
        }
    }

    /**
     * Obtiene los datos de frecuencia actuales
     * @returns {Float32Array} Array con los datos de frecuencia
     */
    getFrequencyData() {
        if (!this.analyser || !this.isCapturing) {
            return null;
        }
        
        this.analyser.getFloatFrequencyData(this.dataArray);
        return this.dataArray;
    }

    /**
     * Obtiene los datos de tiempo (waveform) actuales
     * @returns {Float32Array} Array con los datos de tiempo
     */
    getTimeData() {
        if (!this.analyser || !this.isCapturing) {
            return null;
        }
        
        const timeData = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(timeData);
        return timeData;
    }

    /**
     * Obtiene la frecuencia de muestreo
     * @returns {number} Frecuencia de muestreo en Hz
     */
    getSampleRate() {
        return this.audioContext ? this.audioContext.sampleRate : 44100;
    }

    /**
     * Detiene la captura de audio
     */
    stop() {
        if (this.microphone) {
            this.microphone.disconnect();
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        
        this.isCapturing = false;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
    }

    /**
     * Verifica si está capturando audio
     * @returns {boolean}
     */
    isActive() {
        return this.isCapturing;
    }
}

