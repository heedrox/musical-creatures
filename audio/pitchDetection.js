/**
 * Módulo de detección de pitch (frecuencia fundamental)
 * Usa Pitchfinder con algoritmo YIN para detección estable de pitch
 */
import { YIN, AMDF, DynamicWavelet } from 'pitchfinder';

export class PitchDetection {
    constructor(sampleRate = 44100) {
        this.sampleRate = sampleRate;
        this.minFrequency = 80;  // Frecuencia mínima (voz grave)
        this.maxFrequency = 1000; // Frecuencia máxima (voz aguda)
        
        // Inicializar detectores de Pitchfinder
        // YIN es excelente para voz, AMDF como alternativa
        this.yinDetector = YIN({ 
            sampleRate: this.sampleRate,
            threshold: 0.1,
            minFrequency: this.minFrequency,
            maxFrequency: this.maxFrequency
        });
        
        this.amdfDetector = AMDF({
            sampleRate: this.sampleRate,
            minFrequency: this.minFrequency,
            maxFrequency: this.maxFrequency
        });
        
        // Usar YIN como detector principal
        this.primaryDetector = this.yinDetector;
    }

    /**
     * Detecta la frecuencia fundamental usando Pitchfinder (YIN)
     * @param {Float32Array} timeData - Datos de tiempo del audio
     * @returns {number|null} Frecuencia en Hz o null si no se detecta
     */
    detectPitch(timeData) {
        if (!timeData || timeData.length === 0) {
            return null;
        }

        try {
            // Convertir Float32Array a Array normal (Pitchfinder lo requiere)
            const audioData = Array.from(timeData);
            
            const frequency = this.primaryDetector(audioData);
            
            // Pitchfinder puede devolver null o undefined si no detecta
            if (frequency && frequency > 0 && 
                frequency >= this.minFrequency && 
                frequency <= this.maxFrequency) {
                return frequency;
            }
            
            return null;
        } catch (error) {
            console.error('Error en detección de pitch:', error);
            return null;
        }
    }

    /**
     * Detecta múltiples frecuencias usando Pitchfinder y análisis de frecuencia
     * @param {Float32Array} timeData - Datos de tiempo del audio
     * @param {number} count - Número de frecuencias a detectar
     * @returns {Array<number>} Array de frecuencias en Hz (ordenadas por prominencia)
     */
    detectMultiplePitches(timeData, count = 2) {
        if (!timeData || timeData.length === 0 || count < 1) {
            return [];
        }

        const pitches = [];
        
        // Usar YIN para la primera frecuencia (más estable)
        const primaryPitch = this.detectPitch(timeData);
        if (primaryPitch) {
            pitches.push(primaryPitch);
        }
        
        // Si necesitamos más frecuencias, usar análisis de frecuencia
        if (count > 1 && pitches.length > 0) {
            const additionalPitches = this.findAdditionalPitches(timeData, pitches, count - 1);
            pitches.push(...additionalPitches);
        }
        
        // Si no encontramos la primera con YIN, intentar con AMDF
        if (pitches.length === 0) {
            try {
                const amdfPitch = this.amdfDetector(timeData);
                if (amdfPitch && amdfPitch > 0 && 
                    amdfPitch >= this.minFrequency && 
                    amdfPitch <= this.maxFrequency) {
                    pitches.push(amdfPitch);
                    
                    // Buscar más si es necesario
                    if (count > 1) {
                        const additionalPitches = this.findAdditionalPitches(timeData, pitches, count - 1);
                        pitches.push(...additionalPitches);
                    }
                }
            } catch (error) {
                console.error('Error en detección AMDF:', error);
            }
        }
        
        return pitches.slice(0, count);
    }

    /**
     * Encuentra frecuencias adicionales usando análisis de frecuencia (FFT)
     * @param {Float32Array} timeData - Datos de tiempo del audio
     * @param {Array<number>} existingPitches - Frecuencias ya detectadas
     * @param {number} count - Número de frecuencias adicionales a encontrar
     * @returns {Array<number>} Array de frecuencias adicionales
     */
    findAdditionalPitches(timeData, existingPitches, count) {
        // Para múltiples pitches, usamos un enfoque simple:
        // Intentar detectar con diferentes rangos de frecuencia
        // o usar análisis de frecuencia para encontrar picos adicionales
        
        const additionalPitches = [];
        const minSeparation = 0.15; // Separación mínima entre frecuencias (15%)
        
        // Convertir Float32Array a Array normal
        const audioData = Array.from(timeData);
        
        // Crear detectores con diferentes rangos para encontrar otras frecuencias
        for (let i = 0; i < count && additionalPitches.length < count; i++) {
            // Intentar con AMDF como detector alternativo
            try {
                const pitch = this.amdfDetector(audioData);
                
                if (pitch && pitch > 0 && 
                    pitch >= this.minFrequency && 
                    pitch <= this.maxFrequency) {
                    
                    // Verificar que no sea similar a las frecuencias ya detectadas
                    let isDuplicate = false;
                    for (const existing of [...existingPitches, ...additionalPitches]) {
                        const separation = Math.abs(pitch - existing) / existing;
                        if (separation < minSeparation) {
                            isDuplicate = true;
                            break;
                        }
                        
                        // Verificar si es armónico
                        const ratio = pitch / existing;
                        if (Math.abs(ratio - Math.round(ratio)) < 0.1 || 
                            Math.abs(1/ratio - Math.round(1/ratio)) < 0.1) {
                            isDuplicate = true;
                            break;
                        }
                    }
                    
                    if (!isDuplicate) {
                        additionalPitches.push(pitch);
                    }
                }
            } catch (error) {
                // Continuar con el siguiente intento
            }
        }
        
        return additionalPitches;
    }

    /**
     * Convierte frecuencia a nota musical
     * @param {number} frequency - Frecuencia en Hz
     * @returns {string} Nota musical (ej: "A4", "C#5")
     */
    frequencyToNote(frequency) {
        if (!frequency || frequency <= 0) {
            return '--';
        }

        // A4 = 440 Hz
        const A4 = 440;
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        
        // Calcular semitonos desde A4
        const semitones = 12 * Math.log2(frequency / A4);
        const noteNumber = Math.round(semitones) + 9; // A4 es la nota 9 en la octava 4
        
        const octave = Math.floor(noteNumber / 12) + 4;
        const noteIndex = ((noteNumber % 12) + 12) % 12;
        const noteName = noteNames[noteIndex];
        
        return `${noteName}${octave}`;
    }

    /**
     * Actualiza la frecuencia de muestreo
     * @param {number} sampleRate - Nueva frecuencia de muestreo
     */
    setSampleRate(sampleRate) {
        this.sampleRate = sampleRate;
        
        // Recrear detectores con la nueva frecuencia de muestreo
        this.yinDetector = YIN({ 
            sampleRate: this.sampleRate,
            threshold: 0.1,
            minFrequency: this.minFrequency,
            maxFrequency: this.maxFrequency
        });
        
        this.amdfDetector = AMDF({
            sampleRate: this.sampleRate,
            minFrequency: this.minFrequency,
            maxFrequency: this.maxFrequency
        });
        
        this.primaryDetector = this.yinDetector;
    }
}

