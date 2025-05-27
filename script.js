document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const challengeWordDisplay = document.getElementById('challengeWordDisplay');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const timerDisplay = document.getElementById('timerDisplay');
    const messageDisplay = document.getElementById('messageDisplay');
    const statusDisplay = document.getElementById('statusDisplay');
    const usedWordsPlayerList = document.getElementById('usedWordsPlayerList');

    let listaPalabrasIA = [];
    let palabrasDichasPorJugador = new Set();

    let puntuacion = 0;
    let palabraDesafioActual = '';
    let silabaObjetivo = '';
    let temporizadorId;
    let tiempoRestante = 10;
    let recognition;
    let estaJugando = false;
    let palabrasCargadas = false;
    let speechRecognitionActivo = false;
    let palabraProcesadaEnTurnoActual = false;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    async function cargarListaPalabras() {
        statusDisplay.textContent = 'Cargando palabras...';
        startButton.disabled = true;
        try {
            const response = await fetch('palabras.txt'); // Asegúrate que palabras.txt está en la misma carpeta
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const text = await response.text();
            listaPalabrasIA = text.split('\n')
                                .map(palabra => normalizarTexto(palabra.trim()))
                                .filter(palabra => palabra.length > 1);
            if (listaPalabrasIA.length === 0) throw new Error("La lista de palabras está vacía.");
            palabrasCargadas = true;
            statusDisplay.textContent = '¡Palabras cargadas! Listo para jugar.';
            startButton.disabled = false;
        } catch (error) {
            console.error("Error al cargar la lista de palabras:", error);
            statusDisplay.textContent = 'Error al cargar palabras. Intenta recargar.';
            messageDisplay.textContent = 'No se pudo cargar la lista de palabras necesaria para jugar.';
            startButton.disabled = true;
        }
    }

    if (!SpeechRecognition) {
        statusDisplay.textContent = "Tu navegador no soporta reconocimiento de voz. Prueba con Chrome o Edge.";
        startButton.disabled = true;
        return;
    } else {
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = procesarEntradaVoz;
        recognition.onerror = manejarErrorVoz;
        recognition.onstart = () => {
            speechRecognitionActivo = true;
            statusDisplay.textContent = 'Escuchando... ¡Habla!';
        };
        recognition.onend = () => {
            speechRecognitionActivo = false;
            if (estaJugando && !palabraProcesadaEnTurnoActual && tiempoRestante > 0) {
                iniciarEscucha();
            }
        };
        cargarListaPalabras();
    }

    function iniciarEscucha() {
        if (!estaJugando || speechRecognitionActivo) return;
        if (recognition) {
            try {
                recognition.start();
            } catch (e) {
                console.error("Error al iniciar recognition:", e);
                statusDisplay.textContent = 'Error al activar micrófono. Reintentando...';
                setTimeout(() => {
                    if (estaJugando && !speechRecognitionActivo) {
                        try { recognition.start(); }
                        catch (e2) { terminarJuego("No se pudo activar el micrófono después de un error."); }
                    }
                }, 250);
            }
        }
    }

    function iniciarJuego() {
        if (!palabrasCargadas || listaPalabrasIA.length === 0) {
            messageDisplay.textContent = !palabrasCargadas ? "Las palabras aún se están cargando..." : "No hay palabras cargadas para iniciar.";
            return;
        }
        puntuacion = 0;
        actualizarPuntuacion(0);
        palabrasDichasPorJugador.clear();
        actualizarListaPalabrasDichasPorJugador();

        messageDisplay.textContent = '';
        startButton.disabled = true;
        estaJugando = true;
        palabraProcesadaEnTurnoActual = false;

        palabraDesafioActual = seleccionarPalabraAleatoriaIA();
        if (!palabraDesafioActual) {
            terminarJuego("Error: No se pudo seleccionar una palabra inicial para la IA.");
            return;
        }
        const ultimaSilaba = obtenerUltimaSilaba(palabraDesafioActual);
        if (!ultimaSilaba) {
            terminarJuego(`Error al obtener sílaba de la palabra inicial: "${palabraDesafioActual}".`);
            return;
        }
        silabaObjetivo = ultimaSilaba;
        resaltarSilabaEnPantalla(palabraDesafioActual, silabaObjetivo);
        iniciarTemporizador();
        iniciarEscucha();
    }

    function seleccionarPalabraAleatoriaIA(silabaInicialRequerida = null) {
        let palabrasFiltradas = listaPalabrasIA;
        if (silabaInicialRequerida) {
            const silabaNorm = normalizarTexto(silabaInicialRequerida);
            palabrasFiltradas = listaPalabrasIA.filter(p => normalizarTexto(p).startsWith(silabaNorm));
        }
        if (palabrasFiltradas.length === 0) return null;
        return palabrasFiltradas[Math.floor(Math.random() * palabrasFiltradas.length)];
    }

    function obtenerSilabas(palabraNORMALIZADA) {
        if (!palabraNORMALIZADA) return [];
        const VOCALES_MAYUS = "AEIOUÁÉÍÓÚÜ";
        const silabasRegex = new RegExp( `[^${VOCALES_MAYUS}]*[${VOCALES_MAYUS}]+(?:[^${VOCALES_MAYUS}]+(?![${VOCALES_MAYUS}])|[^${VOCALES_MAYUS}]*(?=$))`, 'gi');
        let matches = palabraNORMALIZADA.match(silabasRegex);
        if (matches && matches.length > 0) return matches.filter(s => s && s.length > 0).map(s => s.toUpperCase());
        return [palabraNORMALIZADA]; // Fallback
    }

    function obtenerUltimaSilaba(palabraNORMALIZADA) {
        const silabas = obtenerSilabas(palabraNORMALIZADA);
        if (silabas && silabas.length > 0) return silabas[silabas.length - 1];
        return null;
    }

    function resaltarSilabaEnPantalla(palabra, silaba) {
        palabra = palabra.toUpperCase();
        silaba = silaba.toUpperCase();
        const indiceUltimaSilaba = palabra.lastIndexOf(silaba);
        if (indiceUltimaSilaba !== -1 && (indiceUltimaSilaba + silaba.length === palabra.length)) {
            challengeWordDisplay.innerHTML = palabra.substring(0, indiceUltimaSilaba) + `<span class="highlight">${silaba}</span>`;
        } else {
             if (palabra.endsWith(silaba)) {
                 challengeWordDisplay.innerHTML = palabra.substring(0, palabra.length - silaba.length) + `<span class="highlight">${palabra.substring(palabra.length - silaba.length)}</span>`;
            } else { // Fallback si la sílaba no coincide exactamente
                challengeWordDisplay.innerHTML = palabra + ` (<span class="highlight">${silaba}</span>?)`;
            }
        }
    }

    function procesarEntradaVoz(evento) {
        if (!estaJugando) return;
        
        palabraProcesadaEnTurnoActual = true;
        clearTimeout(temporizadorId);

        let palabraUsuario = evento.results[0][0].transcript;
        palabraUsuario = normalizarTexto(palabraUsuario); 
        
        if (!palabraUsuario) {
            palabraProcesadaEnTurnoActual = false; // No se procesó realmente
            iniciarTemporizador(); // Reiniciar timer para este intento
            return;
        }
        
        messageDisplay.textContent = `Dijiste: ${palabraUsuario}`;

        if (palabrasDichasPorJugador.has(palabraUsuario)) {
            terminarJuego(`Ya dijiste "${palabraUsuario}". ¡Intenta con otra!`);
            return;
        }

        if (palabraUsuario.startsWith(silabaObjetivo)) { 
            // const silabasUsuario = obtenerSilabas(palabraUsuario); // Ya no se usa para puntuación
            // if (!silabasUsuario || silabasUsuario.length === 0) {
            //     terminarJuego(`"${palabraUsuario}" no parece una palabra válida.`);
            //     return;
            // }

            // *** PUNTUACIÓN BASADA EN LONGITUD DE PALABRA DEL USUARIO ***
            const puntosGanados = palabraUsuario.length;
            puntuacion += puntosGanados;
            actualizarPuntuacion(puntuacion);
            messageDisplay.textContent = `¡Correcto! "${palabraUsuario}" te da ${puntosGanados} puntos.`;


            palabrasDichasPorJugador.add(palabraUsuario);
            actualizarListaPalabrasDichasPorJugador();

            const proximaSilabaInicial = obtenerUltimaSilaba(palabraUsuario);

            if (!proximaSilabaInicial) {
                terminarJuego(`No pude obtener la última sílaba de "${palabraUsuario}".`);
                return;
            }
            
            const nuevaPalabraDesafio = seleccionarPalabraAleatoriaIA(proximaSilabaInicial);

            if (nuevaPalabraDesafio) {
                palabraDesafioActual = nuevaPalabraDesafio;
                const nuevaUltimaSilaba = obtenerUltimaSilaba(palabraDesafioActual);
                if (!nuevaUltimaSilaba) {
                    terminarJuego(`Error al obtener sílaba de nueva palabra IA: "${palabraDesafioActual}".`);
                    return;
                }
                silabaObjetivo = nuevaUltimaSilaba;
                resaltarSilabaEnPantalla(palabraDesafioActual, silabaObjetivo);
                
                palabraProcesadaEnTurnoActual = false; 
                iniciarTemporizador(); 
                iniciarEscucha(); 
            } else {
                terminarJuego(`¡Increíble! La IA no encontró palabra que empiece con "${proximaSilabaInicial.toUpperCase()}". ¡Has ganado!`);
            }
        } else {
            terminarJuego(`Incorrecto. "${palabraUsuario}" no empieza con "${silabaObjetivo.toUpperCase()}".`);
        }
    }

    function manejarErrorVoz(evento) {
        if (!estaJugando) return;
        
        if (evento.error === 'no-speech') {
            statusDisplay.textContent = "No se detectó voz. Sigo escuchando...";
        } else if (evento.error === 'audio-capture' || evento.error === 'not-allowed') {
            const msg = evento.error === 'audio-capture' ? "Problema con el micrófono." : "Permiso de micrófono denegado.";
            terminarJuego(msg);
        } else if (evento.error === 'aborted') {
            if (estaJugando && !palabraProcesadaEnTurnoActual && tiempoRestante > 0) {
                 statusDisplay.textContent = "Escucha interrumpida, reintentando...";
            }
        } else { 
            statusDisplay.textContent = `Error de reconocimiento: ${evento.error}. Sigo intentando...`;
        }
    }

    function actualizarPuntuacion(nuevaPuntuacion) {
        puntuacion = nuevaPuntuacion;
        scoreDisplay.textContent = `Puntuación: ${puntuacion}`;
    }

    function actualizarListaPalabrasDichasPorJugador() {
        if (!usedWordsPlayerList) return;
        usedWordsPlayerList.innerHTML = '';
        palabrasDichasPorJugador.forEach(palabra => {
            const li = document.createElement('li');
            li.textContent = palabra;
            usedWordsPlayerList.appendChild(li);
        });
        const container = document.getElementById('usedWordsPlayerContainer');
        if (container) container.scrollTop = container.scrollHeight;
    }

    function iniciarTemporizador() {
        clearTimeout(temporizadorId);
        tiempoRestante = 10;
        timerDisplay.textContent = `Tiempo: ${tiempoRestante}s`;
        
        temporizadorId = setInterval(() => {
            tiempoRestante--;
            timerDisplay.textContent = `Tiempo: ${tiempoRestante}s`;
            if (tiempoRestante < 0) tiempoRestante = 0; 
            if (tiempoRestante === 0) {
                clearTimeout(temporizadorId);
                if (estaJugando && !palabraProcesadaEnTurnoActual) { 
                    if (speechRecognitionActivo && recognition) {
                        recognition.abort(); 
                    }
                    terminarJuego("¡Tiempo agotado!");
                }
            }
        }, 1000);
    }

    function terminarJuego(mensajeFinal = "Juego Terminado") {
        if (!estaJugando) return; 
        estaJugando = false;
        clearTimeout(temporizadorId);
        if (recognition && speechRecognitionActivo) {
            recognition.abort(); 
        }
        speechRecognitionActivo = false;
        
        messageDisplay.textContent = `${mensajeFinal} Puntuación final: ${puntuacion}.`;
        if (palabrasCargadas && listaPalabrasIA.length > 0) {
            statusDisplay.textContent = 'Presiona "Comenzar Juego" para jugar de nuevo.';
            startButton.disabled = false;
        } else {
            statusDisplay.textContent = !palabrasCargadas ? 'Error al cargar palabras.' : 'Lista de palabras vacía.';
            startButton.disabled = true;
        }
        challengeWordDisplay.innerHTML = "---"; 
        timerDisplay.textContent = `Tiempo: -`;
    }

    function normalizarTexto(texto) {
        if (!texto) return '';
        // Quitar espacios múltiples y al inicio/fin, convertir a MAYUS, quitar acentos y puntuación.
        return texto.trim().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡"]/g,"")
            .replace(/\s\s+/g, ' '); // Reemplaza múltiples espacios internos por uno solo
    }

    startButton.addEventListener('click', iniciarJuego);
});