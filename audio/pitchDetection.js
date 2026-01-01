/**
 * Módulo de detección de pitch (frecuencia fundamental)
 * Usa Pitchfinder con algoritmo YIN para detección estable de pitch
 * AMDF como fallback si YIN falla
 * Solo detecta una frecuencia (un solo jugador)
 */
import { YIN, AMDF } from 'pitchfinder';

export class PitchDetection {
    constructor(sampleRate = 44100) {
        this.sampleRate = sampleRate;
        this.minFrequency = 80;  // Frecuencia mínima (voz grave)
        this.maxFrequency = 1000; // Frecuencia máxima (voz aguda)
        
        // Inicializar detectores de Pitchfinder
        // YIN es excelente para voz, AMDF como fallback
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
    }

    /**
     * Detecta la frecuencia fundamental usando Pitchfinder (YIN con fallback AMDF)
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
            
            // Intentar primero con YIN (más preciso para voz)
            let frequency = this.yinDetector(audioData);
            
            // Si YIN falla, intentar con AMDF como fallback
            if (!frequency || frequency <= 0 || 
                frequency < this.minFrequency || frequency > this.maxFrequency) {
                frequency = this.amdfDetector(audioData);
            }
            
            // Validar que la frecuencia está en el rango válido
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
    }
}

