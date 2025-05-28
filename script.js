document.addEventListener('DOMContentLoaded', () => {
    // Selección de Modo
    const gameModeSelectionDiv = document.getElementById('gameModeSelection');
    const onePlayerButton = document.getElementById('onePlayerButton');
    const twoPlayerButton = document.getElementById('twoPlayerButton');
    const backToModeSelectionButton = document.getElementById('backToModeSelectionButton');

    // Área de Juego
    const gameAreaDiv = document.getElementById('gameArea');
    const gameModeInfo = document.getElementById('gameModeInfo');
    const startGameButton = document.getElementById('startGameButton');
    const challengeWordDisplay = document.getElementById('challengeWordDisplay');
    const challengeWordLabel = document.getElementById('challengeWordLabel');
    const scorePlayer1Display = document.getElementById('scorePlayer1Display');
    const scorePlayer2Display = document.getElementById('scorePlayer2Display');
    const timerDisplay = document.getElementById('timerDisplay');
    const messageDisplay = document.getElementById('messageDisplay');
    const statusDisplay = document.getElementById('statusDisplay');
    const usedWordsList = document.getElementById('usedWordsList');
    const turnInfoDisplay = document.getElementById('turnInfoDisplay');


    let listaPalabrasIA = [];
    let palabrasUsadasGlobal = new Set();

    // Estado del Juego
    let modoDeJuego = null;
    let puntuacionJ1 = 0;
    let puntuacionJ2 = 0;
    let jugadorActual2P = 1;
    let palabraAnteriorGlobal = '';
    let silabaObjetivoGlobal = '';

    let temporizadorId;
    let tiempoRestante = 10;
    const TIEMPO_TURNO_NORMAL = 10;
    const TIEMPO_PRIMER_TURNO_2P = 15;

    let recognition;
    let estaJugando = false;
    let palabrasCargadas = false;
    let speechRecognitionActivo = false;
    let palabraProcesadaEnTurnoActual = false;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // --- INICIALIZACIÓN Y SELECCIÓN DE MODO ---
    function setupGameMode(mode) {
        modoDeJuego = mode;
        gameModeSelectionDiv.classList.add('fade-out');
        
        setTimeout(() => {
            gameModeSelectionDiv.classList.add('hidden');
            gameModeSelectionDiv.classList.remove('fade-out');
            gameAreaDiv.classList.remove('hidden');
        }, 500);

        startGameButton.disabled = false;
        statusDisplay.textContent = 'Presiona "Comenzar Juego"';
        messageDisplay.className = '';

        if (mode === '1P') {
            gameModeInfo.textContent = "Modo: Un Jugador (vs IA)";
            scorePlayer2Display.classList.add('hidden');
            turnInfoDisplay.classList.add('hidden');
            challengeWordLabel.textContent = "Palabra de desafío (empieza con su última sílaba):";
            scorePlayer1Display.textContent = "Puntuación: 0";
            if (!palabrasCargadas) {
                cargarListaPalabrasIA();
            } else {
                 startGameButton.disabled = !palabrasCargadas;
                 if (!palabrasCargadas) statusDisplay.textContent = 'Cargando palabras para la IA...';
            }
        } else if (mode === '2P') {
            gameModeInfo.textContent = "Modo: Dos Jugadores";
            scorePlayer1Display.textContent = "Jugador 1: 0";
            scorePlayer2Display.classList.remove('hidden');
            scorePlayer2Display.textContent = "Jugador 2: 0";
            turnInfoDisplay.classList.remove('hidden');
            turnInfoDisplay.textContent = "Turno: ---";
            challengeWordLabel.textContent = "Palabra anterior (la última sílaba es el objetivo):";
            startGameButton.disabled = false; 
        }
        challengeWordDisplay.innerHTML = '---';
        actualizarPuntuaciones();
        palabrasUsadasGlobal.clear();
        actualizarListaPalabrasUsadas();
    }

    onePlayerButton.addEventListener('click', () => setupGameMode('1P'));
    twoPlayerButton.addEventListener('click', () => setupGameMode('2P'));
    
    backToModeSelectionButton.addEventListener('click', () => {
        terminarJuegoActualSilenciosamente();
        gameAreaDiv.style.opacity = '0';
        gameAreaDiv.style.transform = 'translateY(20px)';

        setTimeout(() => {
            gameAreaDiv.classList.add('hidden');
            gameAreaDiv.style.opacity = ''; 
            gameAreaDiv.style.transform = '';
            gameModeSelectionDiv.classList.remove('hidden');
            void gameModeSelectionDiv.offsetWidth; 
            gameModeSelectionDiv.style.opacity = '1';
            gameModeSelectionDiv.style.transform = 'translateY(0)';
        }, 300);
        
        modoDeJuego = null;
    });


    async function cargarListaPalabrasIA() {
        if (palabrasCargadas) return;
        statusDisplay.textContent = 'Cargando palabras para la IA...';
        startGameButton.disabled = true;
        try {
            const response = await fetch('palabras.txt');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const text = await response.text();
            listaPalabrasIA = text.split('\n')
                                .map(palabra => normalizarTexto(palabra.trim()))
                                .filter(palabra => palabra.length > 1);
            if (listaPalabrasIA.length === 0) throw new Error("La lista de palabras de la IA está vacía.");
            palabrasCargadas = true;
            statusDisplay.textContent = '¡Palabras de IA cargadas! Presiona "Comenzar Juego".';
            startGameButton.disabled = false;
        } catch (error) {
            console.error("Error al cargar la lista de palabras de la IA:", error);
            statusDisplay.textContent = 'Error al cargar palabras para IA. Intenta recargar.';
            messageDisplay.textContent = 'No se pudo cargar la lista de palabras para la IA.';
            messageDisplay.className = 'error';
            startGameButton.disabled = true;
        }
    }

    if (!SpeechRecognition) {
        statusDisplay.textContent = "Tu navegador no soporta reconocimiento de voz. Prueba con Chrome o Edge.";
        onePlayerButton.disabled = true;
        twoPlayerButton.disabled = true;
        return;
    } else {
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false; // Se mantiene false, la lógica de re-escucha está en onend
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
    }

    // --- LÓGICA DE JUEGO (ADAPTABLE) ---

    function iniciarEscucha() {
        if (!estaJugando || speechRecognitionActivo || !modoDeJuego) return;
        if (recognition) {
            try {
                recognition.start();
            } catch (e) {
                console.error("Error al iniciar recognition:", e);
                setTimeout(() => {
                    if (estaJugando && !speechRecognitionActivo) {
                        try { recognition.start(); }
                        catch (e2) { terminarJuego("No se pudo activar el micrófono."); }
                    }
                }, 250);
            }
        }
    }

    function iniciarJuego() {
        if (!modoDeJuego) return;
        puntuacionJ1 = 0;
        puntuacionJ2 = 0;
        palabrasUsadasGlobal.clear();
        actualizarListaPalabrasUsadas();
        actualizarPuntuaciones();
        messageDisplay.textContent = '';
        messageDisplay.className = '';
        startGameButton.disabled = true;
        backToModeSelectionButton.classList.add('hidden');
        estaJugando = true;
        palabraProcesadaEnTurnoActual = false;
        palabraAnteriorGlobal = '';
        silabaObjetivoGlobal = '';

        if (modoDeJuego === '1P') {
            if (!palabrasCargadas || listaPalabrasIA.length === 0) {
                messageDisplay.textContent = "Error: Palabras de IA no cargadas.";
                messageDisplay.className = 'error';
                terminarJuegoActualSilenciosamente();
                return;
            }
            scorePlayer1Display.classList.remove('active-turn');
            scorePlayer2Display.classList.remove('active-turn');
            palabraAnteriorGlobal = seleccionarPalabraAleatoriaIA();
            if (!palabraAnteriorGlobal) {
                terminarJuego("Error: No se pudo seleccionar palabra inicial para la IA.");
                return;
            }
            const ultimaSilaba = obtenerUltimaSilaba(palabraAnteriorGlobal);
            if (!ultimaSilaba) {
                terminarJuego(`Error al obtener sílaba de: "${palabraAnteriorGlobal}".`);
                return;
            }
            silabaObjetivoGlobal = ultimaSilaba;
            resaltarSilabaEnPantalla(palabraAnteriorGlobal, silabaObjetivoGlobal);
            tiempoRestante = TIEMPO_TURNO_NORMAL;

        } else if (modoDeJuego === '2P') {
            jugadorActual2P = 1;
            turnInfoDisplay.textContent = `Turno: Jugador ${jugadorActual2P}`;
            actualizarResaltadoTurno2P();
            messageDisplay.textContent = `Jugador ${jugadorActual2P}, di cualquier palabra para empezar.`;
            challengeWordDisplay.innerHTML = '---';
            tiempoRestante = TIEMPO_PRIMER_TURNO_2P;
        }
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


    function procesarEntradaVoz(evento) {
        if (!estaJugando) return;
        
        // palabraProcesadaEnTurnoActual se setea a true DESPUÉS de encontrar una palabra válida
        clearTimeout(temporizadorId);

        let transcriptCompleto = evento.results[0][0].transcript;
        let palabraValidaEncontrada = null; // Para almacenar la primera palabra válida de la frase
        let errorEnPalabra = null; // Para almacenar el primer error encontrado

        if (transcriptCompleto) {
            const palabrasDelTranscript = transcriptCompleto.trim().split(/\s+/);
            
            for (const palabraRaw of palabrasDelTranscript) {
                const palabraCandidata = normalizarTexto(palabraRaw);
                if (!palabraCandidata) continue; // Ignorar palabras vacías después de normalizar

                // 1. ¿Comienza con la sílaba objetivo? (Ignorar para la primera palabra en 2P si palabraAnteriorGlobal está vacía)
                if (palabraAnteriorGlobal !== '' && !palabraCandidata.startsWith(silabaObjetivoGlobal)) {
                    if (!errorEnPalabra) errorEnPalabra = `"${palabraCandidata}" no empieza con "${silabaObjetivoGlobal.toUpperCase()}".`;
                    continue; // Probar la siguiente palabra de la frase
                }

                // 2. ¿Palabra ya usada?
                if (palabrasUsadasGlobal.has(palabraCandidata)) {
                    if (!errorEnPalabra) errorEnPalabra = `"${palabraCandidata}" ya fue dicha.`;
                    continue; // Probar la siguiente palabra de la frase
                }
                
                // Si pasa todas las validaciones, es una palabra válida
                palabraValidaEncontrada = palabraCandidata;
                break; // Salir del bucle, ya encontramos una palabra válida
            }
        }

        if (palabraValidaEncontrada) {
            palabraProcesadaEnTurnoActual = true; // Ahora sí, una palabra fue procesada con éxito
            const palabraUsuario = palabraValidaEncontrada; // Usar la palabra encontrada

            messageDisplay.textContent = modoDeJuego === '1P' ? `Usaste: ${palabraUsuario}` : `Jugador ${jugadorActual2P} usó: ${palabraUsuario}`;

            const puntosGanados = palabraUsuario.length;
            if (modoDeJuego === '1P') {
                puntuacionJ1 += puntosGanados;
                messageDisplay.textContent = `¡Correcto! "${palabraUsuario}" (+${puntosGanados} pts).`;
                messageDisplay.className = 'success'; 
            } else { // 2P
                if (jugadorActual2P === 1) puntuacionJ1 += puntosGanados;
                else puntuacionJ2 += puntosGanados;
                messageDisplay.textContent = `¡Jugador ${jugadorActual2P} acierta con "${palabraUsuario}"! (+${puntosGanados} pts).`;
                messageDisplay.className = 'success';
            }
            actualizarPuntuaciones();
            palabrasUsadasGlobal.add(palabraUsuario);
            actualizarListaPalabrasUsadas();
            palabraAnteriorGlobal = palabraUsuario; // Actualizar la palabra anterior para el siguiente turno
            const proximaSilabaParaObjetivo = obtenerUltimaSilaba(palabraUsuario);

            if (!proximaSilabaParaObjetivo) {
                const perdedor = modoDeJuego === '1P' ? null : (jugadorActual2P === 1 ? 2 : 1);
                terminarJuego(`No pude obtener la última sílaba de "${palabraUsuario}".`, perdedor);
                return;
            }
            silabaObjetivoGlobal = proximaSilabaParaObjetivo;

            // Continuar con el flujo del juego (turno de IA o siguiente jugador)
            if (modoDeJuego === '1P') {
                const nuevaPalabraIA = seleccionarPalabraAleatoriaIA(silabaObjetivoGlobal);
                if (nuevaPalabraIA) {
                    palabraAnteriorGlobal = nuevaPalabraIA;
                    const nuevaUltimaSilabaIA = obtenerUltimaSilaba(nuevaPalabraIA);
                    if (!nuevaUltimaSilabaIA) {
                        terminarJuego("Error de la IA al obtener su propia sílaba.");
                        return;
                    }
                    silabaObjetivoGlobal = nuevaUltimaSilabaIA;
                    setTimeout(() => {
                        messageDisplay.textContent = `IA dice: "${nuevaPalabraIA}". ¡Tu turno!`;
                        messageDisplay.className = ''; 
                        resaltarSilabaEnPantalla(nuevaPalabraIA, silabaObjetivoGlobal);
                        palabraProcesadaEnTurnoActual = false; 
                        tiempoRestante = TIEMPO_TURNO_NORMAL;
                        iniciarTemporizador(); 
                        iniciarEscucha(); 
                    }, 1800);
                } else {
                    terminarJuego(`¡Increíble! La IA no encontró palabra para "${silabaObjetivoGlobal.toUpperCase()}". ¡Has ganado!`);
                }
            } else { // modoDeJuego === '2P'
                jugadorActual2P = (jugadorActual2P === 1) ? 2 : 1;
                turnInfoDisplay.textContent = `Turno: Jugador ${jugadorActual2P}`;
                actualizarResaltadoTurno2P();
                messageDisplay.textContent = `Turno del Jugador ${jugadorActual2P}.`;
                messageDisplay.className = ''; 
                resaltarSilabaEnPantalla(palabraAnteriorGlobal, silabaObjetivoGlobal); // Muestra la palabra que acaba de decir el jugador anterior
                palabraProcesadaEnTurnoActual = false; 
                tiempoRestante = TIEMPO_TURNO_NORMAL;
                iniciarTemporizador(); 
                iniciarEscucha(); 
            }

        } else { // No se encontró ninguna palabra válida en la frase, o el transcript estaba vacío
            palabraProcesadaEnTurnoActual = false; // No se procesó nada con éxito
            if (errorEnPalabra) { // Si hubo un error específico con la primera palabra intentada
                const perdedor = modoDeJuego === '1P' ? null : (jugadorActual2P === 1 ? 2 : 1);
                terminarJuego(errorEnPalabra, perdedor);
            } else { // Si simplemente no se dijo nada o nada útil
                statusDisplay.textContent = "No entendí ninguna palabra válida en la frase. Intenta de nuevo.";
                // Dejar que onend reinicie la escucha si el tiempo no ha acabado
            }
        }
    }
    
    // --- FUNCIONES AUXILIARES (Silabificación, Normalización, UI, etc.) ---
    function obtenerSilabas(palabraNORMALIZADA) {
        if (!palabraNORMALIZADA) return [];
        const VOCALES_MAYUS = "AEIOUÁÉÍÓÚÜ";
        const silabasRegex = new RegExp( `[^${VOCALES_MAYUS}]*[${VOCALES_MAYUS}]+(?:[^${VOCALES_MAYUS}]+(?![${VOCALES_MAYUS}])|[^${VOCALES_MAYUS}]*(?=$))`, 'gi');
        let matches = palabraNORMALIZADA.match(silabasRegex);
        if (matches && matches.length > 0) return matches.filter(s => s && s.length > 0).map(s => s.toUpperCase());
        return [palabraNORMALIZADA];
    }
    function obtenerUltimaSilaba(palabraNORMALIZADA) {
        const silabas = obtenerSilabas(palabraNORMALIZADA);
        if (silabas && silabas.length > 0) return silabas[silabas.length - 1];
        return null;
    }
    function resaltarSilabaEnPantalla(palabra, silaba) {
        palabra = palabra.toUpperCase();
        silaba = silaba.toUpperCase();
        if (!palabra) { challengeWordDisplay.innerHTML = "---"; return; }
        const indiceUltimaSilaba = palabra.lastIndexOf(silaba);
        if (indiceUltimaSilaba !== -1 && (indiceUltimaSilaba + silaba.length === palabra.length)) {
            challengeWordDisplay.innerHTML = palabra.substring(0, indiceUltimaSilaba) + `<span class="highlight">${silaba}</span>`;
        } else {
             if (palabra.endsWith(silaba)) {
                 challengeWordDisplay.innerHTML = palabra.substring(0, palabra.length - silaba.length) + `<span class="highlight">${palabra.substring(palabra.length - silaba.length)}</span>`;
            } else {
                challengeWordDisplay.innerHTML = palabra + ` (<span class="highlight">${silaba}</span>?)`;
            }
        }
    }
    function manejarErrorVoz(evento) {
        if (!estaJugando) return;
        if (evento.error === 'no-speech') {
            statusDisplay.textContent = "No se detectó voz. Sigo escuchando...";
        } else if (evento.error === 'audio-capture' || evento.error === 'not-allowed') {
            const msg = evento.error === 'audio-capture' ? "Problema con micrófono." : "Permiso micrófono denegado.";
            const perdedor = (modoDeJuego === '2P') ? (jugadorActual2P === 1 ? 2 : 1) : null;
            terminarJuego(msg, perdedor);
        } else if (evento.error === 'aborted') {
            if (estaJugando && !palabraProcesadaEnTurnoActual && tiempoRestante > 0) {
                 statusDisplay.textContent = "Escucha interrumpida, reintentando...";
            }
        } else { 
            statusDisplay.textContent = `Error reconocimiento: ${evento.error}. Intentando...`;
        }
    }
    function actualizarPuntuaciones() {
        if (modoDeJuego === '1P') {
            scorePlayer1Display.textContent = `Puntuación: ${puntuacionJ1}`;
        } else if (modoDeJuego === '2P') {
            scorePlayer1Display.textContent = `Jugador 1: ${puntuacionJ1}`;
            scorePlayer2Display.textContent = `Jugador 2: ${puntuacionJ2}`;
        } else {
            scorePlayer1Display.textContent = `Jugador 1: 0`;
            scorePlayer2Display.textContent = `Jugador 2: 0`;
        }
    }
    function actualizarResaltadoTurno2P() {
        if (modoDeJuego !== '2P') return;
        if (jugadorActual2P === 1) {
            scorePlayer1Display.classList.add('active-turn');
            scorePlayer2Display.classList.remove('active-turn');
        } else {
            scorePlayer1Display.classList.remove('active-turn');
            scorePlayer2Display.classList.add('active-turn');
        }
    }
    function actualizarListaPalabrasUsadas() {
        if (!usedWordsList) return;
        usedWordsList.innerHTML = '';
        palabrasUsadasGlobal.forEach(palabra => {
            const li = document.createElement('li');
            li.textContent = palabra;
            usedWordsList.appendChild(li);
        });
        const container = document.getElementById('usedWordsPlayerContainer');
        if (container) container.scrollTop = container.scrollHeight;
    }
    function iniciarTemporizador() {
        clearTimeout(temporizadorId);
        timerDisplay.textContent = `Tiempo: ${tiempoRestante}s`;
        timerDisplay.classList.remove('low-time');

        temporizadorId = setInterval(() => {
            tiempoRestante--;
            timerDisplay.textContent = `Tiempo: ${tiempoRestante}s`;
            if (tiempoRestante <= 3 && tiempoRestante > 0) {
                timerDisplay.classList.add('low-time');
            } else if (tiempoRestante <= 0) {
                timerDisplay.classList.remove('low-time');
            }

            if (tiempoRestante < 0) tiempoRestante = 0; 
            if (tiempoRestante === 0) {
                clearTimeout(temporizadorId);
                if (estaJugando && !palabraProcesadaEnTurnoActual) { 
                    if (speechRecognitionActivo && recognition) recognition.abort(); 
                    const perdedor = (modoDeJuego === '2P') ? (jugadorActual2P === 1 ? 2 : 1) : null;
                    let msg = "¡Tiempo agotado!";
                    if (modoDeJuego === '2P') msg = `¡Tiempo agotado para Jugador ${jugadorActual2P}!`;
                    terminarJuego(msg, perdedor);
                }
            }
        }, 1000);
    }
    function terminarJuego(mensajePrincipal = "Juego Terminado", jugadorGanador2P = null) {
        if (!estaJugando && !mensajePrincipal.includes("silenciosamente")) return;
        estaJugando = false;
        clearTimeout(temporizadorId);
        if (recognition && speechRecognitionActivo) recognition.abort(); 
        speechRecognitionActivo = false;
        
        let mensajeCompleto = mensajePrincipal;
        messageDisplay.className = 'error';

        if (mensajePrincipal.toLowerCase().includes("ganaste") || mensajePrincipal.toLowerCase().includes("¡gana jugador")) {
            messageDisplay.className = 'success';
        }


        if (modoDeJuego === '1P') {
            mensajeCompleto += ` Puntuación final: ${puntuacionJ1}.`;
        } else if (modoDeJuego === '2P') {
            let ganadorMsg = "";
            if (jugadorGanador2P) {
                ganadorMsg = ` ¡Gana Jugador ${jugadorGanador2P}!`;
            } else if (mensajePrincipal.includes("agotado") || mensajePrincipal.includes("empieza con") || mensajePrincipal.includes("ya fue dicha") || mensajePrincipal.includes("micrófono") || mensajePrincipal.includes("sílaba")) {
                const ganadorDeterminado = jugadorActual2P === 1 ? 2 : 1;
                ganadorMsg = ` ¡Gana Jugador ${ganadorDeterminado}!`;
            }
            mensajeCompleto += ganadorMsg;
            mensajeCompleto += ` Puntuaciones finales - J1: ${puntuacionJ1}, J2: ${puntuacionJ2}.`;
        }
        
        messageDisplay.textContent = mensajeCompleto;
        statusDisplay.textContent = 'Elige un modo o presiona "Comenzar Juego" si ya elegiste.';
        startGameButton.disabled = false;
        backToModeSelectionButton.classList.remove('hidden');
        timerDisplay.textContent = `Tiempo: -`;
        timerDisplay.classList.remove('low-time');
        if (modoDeJuego === '2P') {
            turnInfoDisplay.textContent = "Juego Terminado";
            scorePlayer1Display.classList.remove('active-turn');
            scorePlayer2Display.classList.remove('active-turn');
        }
    }
    function terminarJuegoActualSilenciosamente() {
        if (!estaJugando) return;
        estaJugando = false;
        clearTimeout(temporizadorId);
        if (recognition && speechRecognitionActivo) recognition.abort();
        speechRecognitionActivo = false;
        palabraProcesadaEnTurnoActual = false;
        messageDisplay.textContent = "";
        messageDisplay.className = "";
        statusDisplay.textContent = "";
        timerDisplay.textContent = "Tiempo: -";
        timerDisplay.classList.remove('low-time');
        challengeWordDisplay.innerHTML = "---";
        if (modoDeJuego === '2P') turnInfoDisplay.textContent = "Turno: ---";
    }

    function normalizarTexto(texto) {
        if (!texto) return '';
        return texto.trim().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡"]/g,"")
            .replace(/\s\s+/g, ' '); 
    }

    startGameButton.addEventListener('click', iniciarJuego);

    gameModeSelectionDiv.style.opacity = '1';
    gameModeSelectionDiv.style.transform = 'translateY(0)';
    gameAreaDiv.style.opacity = '0'; 
    gameAreaDiv.style.transform = 'translateY(20px)';
});