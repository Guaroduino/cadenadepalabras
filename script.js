document.addEventListener('DOMContentLoaded', () => {
    // Selección de Modo
    const gameModeSelectionDiv = document.getElementById('gameModeSelection');
    const onePlayerButton = document.getElementById('onePlayerButton');
    const twoPlayerButton = document.getElementById('twoPlayerButton');
    const backToModeSelectionButton = document.getElementById('backToModeSelectionButton');

    // Área de Juego
    const gameAreaDiv = document.getElementById('gameArea');
    const gameModeInfo = document.getElementById('gameModeInfo');
    const startGameButton = document.getElementById('startGameButton'); // Renombrado de startButton
    const challengeWordDisplay = document.getElementById('challengeWordDisplay');
    const challengeWordLabel = document.getElementById('challengeWordLabel');
    const scorePlayer1Display = document.getElementById('scorePlayer1Display');
    const scorePlayer2Display = document.getElementById('scorePlayer2Display');
    const timerDisplay = document.getElementById('timerDisplay');
    const messageDisplay = document.getElementById('messageDisplay');
    const statusDisplay = document.getElementById('statusDisplay');
    const usedWordsList = document.getElementById('usedWordsList');
    const turnInfoDisplay = document.getElementById('turnInfoDisplay');


    let listaPalabrasIA = []; // Solo para modo 1 Jugador
    let palabrasUsadasGlobal = new Set(); // Palabras dichas en la partida actual (ambos modos)

    // Estado del Juego
    let modoDeJuego = null; // '1P' o '2P'
    let puntuacionJ1 = 0;
    let puntuacionJ2 = 0; // Usado solo en 2P
    let jugadorActual2P = 1; // Usado solo en 2P (1 o 2)
    let palabraAnteriorGlobal = ''; // Última palabra válida (ambos modos)
    let silabaObjetivoGlobal = ''; // Última sílaba de palabraAnteriorGlobal (ambos modos)

    let temporizadorId;
    let tiempoRestante = 10;
    const TIEMPO_TURNO_NORMAL = 10;
    const TIEMPO_PRIMER_TURNO_2P = 15; // Para 2P

    let recognition;
    let estaJugando = false;
    let palabrasCargadas = false; // Para listaPalabrasIA
    let speechRecognitionActivo = false;
    let palabraProcesadaEnTurnoActual = false;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // --- INICIALIZACIÓN Y SELECCIÓN DE MODO ---
    function setupGameMode(mode) {
        modoDeJuego = mode;
        gameModeSelectionDiv.classList.add('hidden');
        gameAreaDiv.classList.remove('hidden');
        startGameButton.disabled = false; // Habilitar botón de comenzar juego
        statusDisplay.textContent = 'Presiona "Comenzar Juego"';

        if (mode === '1P') {
            gameModeInfo.textContent = "Modo: Un Jugador (vs IA)";
            scorePlayer2Display.classList.add('hidden');
            turnInfoDisplay.classList.add('hidden');
            challengeWordLabel.textContent = "Palabra de desafío (empieza con su última sílaba):";
            scorePlayer1Display.textContent = "Puntuación: 0"; // Etiqueta genérica
            if (!palabrasCargadas) {
                cargarListaPalabrasIA(); // Cargar solo si es necesario y no está cargada
            } else {
                 startGameButton.disabled = !palabrasCargadas; // Deshabilitar si aún no se cargan
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
            // No se necesita cargar lista de IA para 2P
            startGameButton.disabled = false; 
        }
        // Limpiar campos de juego anteriores
        challengeWordDisplay.innerHTML = '---';
        messageDisplay.textContent = '';
        actualizarPuntuaciones(); // Para resetear visualmente
        palabrasUsadasGlobal.clear();
        actualizarListaPalabrasUsadas();
    }

    onePlayerButton.addEventListener('click', () => setupGameMode('1P'));
    twoPlayerButton.addEventListener('click', () => setupGameMode('2P'));
    backToModeSelectionButton.addEventListener('click', () => {
        terminarJuegoActualSilenciosamente();
        gameAreaDiv.classList.add('hidden');
        gameModeSelectionDiv.classList.remove('hidden');
        modoDeJuego = null;
    });


    async function cargarListaPalabrasIA() {
        if (palabrasCargadas) return; // No recargar si ya están
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
            startGameButton.disabled = true;
        }
    }

    if (!SpeechRecognition) {
        statusDisplay.textContent = "Tu navegador no soporta reconocimiento de voz.";
        onePlayerButton.disabled = true;
        twoPlayerButton.disabled = true;
        return;
    } else {
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = procesarEntradaVoz; // Se adaptará según el modo
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
        // No cargar palabras IA aquí, se hará al seleccionar modo 1P
    }

    // --- LÓGICA DE JUEGO (ADAPTABLE) ---

    function iniciarEscucha() {
        if (!estaJugando || speechRecognitionActivo || !modoDeJuego) return; // No escuchar si no hay modo o juego activo
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

    function iniciarJuego() { // Este es el que se llama con startGameButton
        if (!modoDeJuego) return;

        // Resetear puntuaciones y estado común
        puntuacionJ1 = 0;
        puntuacionJ2 = 0;
        palabrasUsadasGlobal.clear();
        actualizarListaPalabrasUsadas();
        actualizarPuntuaciones(); // Actualiza visualmente J1 y J2 (J2 se oculta en CSS si es 1P)

        messageDisplay.textContent = '';
        startGameButton.disabled = true;
        backToModeSelectionButton.classList.add('hidden'); // Ocultar mientras se juega
        estaJugando = true;
        palabraProcesadaEnTurnoActual = false;
        palabraAnteriorGlobal = '';
        silabaObjetivoGlobal = '';

        if (modoDeJuego === '1P') {
            if (!palabrasCargadas || listaPalabrasIA.length === 0) {
                messageDisplay.textContent = "Error: Palabras de IA no cargadas.";
                terminarJuegoActualSilenciosamente(); // Permite volver a intentar o cambiar modo
                return;
            }
            scorePlayer1Display.classList.remove('active-turn'); // Limpiar resaltado
            scorePlayer2Display.classList.remove('active-turn');

            palabraAnteriorGlobal = seleccionarPalabraAleatoriaIA(); // Primera palabra de la IA
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
            challengeWordDisplay.innerHTML = "---"; // No mostrar la primera palabra de la IA, sino el desafío
            resaltarSilabaEnPantalla(palabraAnteriorGlobal, silabaObjetivoGlobal); // Mostrar la palabra de la IA con su sílaba
            tiempoRestante = TIEMPO_TURNO_NORMAL;

        } else if (modoDeJuego === '2P') {
            jugadorActual2P = 1;
            turnInfoDisplay.textContent = `Turno: Jugador ${jugadorActual2P}`;
            actualizarResaltadoTurno2P();
            messageDisplay.textContent = `Jugador ${jugadorActual2P}, di cualquier palabra para empezar.`;
            challengeWordDisplay.innerHTML = '---'; // Primera palabra la dice el jugador
            tiempoRestante = TIEMPO_PRIMER_TURNO_2P;
        }

        iniciarTemporizador();
        iniciarEscucha();
    }

    function seleccionarPalabraAleatoriaIA(silabaInicialRequerida = null) {
        // (Sin cambios respecto a la versión anterior de 1P)
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
        
        palabraProcesadaEnTurnoActual = true;
        clearTimeout(temporizadorId);

        let palabraUsuario = evento.results[0][0].transcript;
        palabraUsuario = normalizarTexto(palabraUsuario); 
        
        if (!palabraUsuario) {
            palabraProcesadaEnTurnoActual = false;
            iniciarTemporizador();
            return;
        }
        
        messageDisplay.textContent = modoDeJuego === '1P' ? `Dijiste: ${palabraUsuario}` : `Jugador ${jugadorActual2P} dijo: ${palabraUsuario}`;

        if (palabrasUsadasGlobal.has(palabraUsuario)) {
            const perdedor = modoDeJuego === '1P' ? null : (jugadorActual2P === 1 ? 2 : 1);
            terminarJuego(`"${palabraUsuario}" ya fue dicha.`, perdedor);
            return;
        }

        // Validación de sílaba (ignorar para la primera palabra en 2P)
        if (palabraAnteriorGlobal !== '' && !palabraUsuario.startsWith(silabaObjetivoGlobal)) {
            const perdedor = modoDeJuego === '1P' ? null : (jugadorActual2P === 1 ? 2 : 1);
            terminarJuego(`"${palabraUsuario}" no empieza con "${silabaObjetivoGlobal.toUpperCase()}".`, perdedor);
            return;
        }

        // Puntuación
        const puntosGanados = palabraUsuario.length;
        if (modoDeJuego === '1P') {
            puntuacionJ1 += puntosGanados;
        } else { // 2P
            if (jugadorActual2P === 1) puntuacionJ1 += puntosGanados;
            else puntuacionJ2 += puntosGanados;
        }
        actualizarPuntuaciones();
        
        palabrasUsadasGlobal.add(palabraUsuario);
        actualizarListaPalabrasUsadas();

        // Preparar siguiente turno
        palabraAnteriorGlobal = palabraUsuario;
        const proximaSilabaParaObjetivo = obtenerUltimaSilaba(palabraUsuario);

        if (!proximaSilabaParaObjetivo) {
            const perdedor = modoDeJuego === '1P' ? null : (jugadorActual2P === 1 ? 2 : 1);
            terminarJuego(`No pude obtener la última sílaba de "${palabraUsuario}".`, perdedor);
            return;
        }
        silabaObjetivoGlobal = proximaSilabaParaObjetivo; // Esta es la sílaba con la que debe empezar la siguiente palabra

        if (modoDeJuego === '1P') {
            messageDisplay.textContent = `¡Correcto! "${palabraUsuario}" (+${puntosGanados} pts). Turno de la IA...`;
            // Turno de la IA
            const nuevaPalabraIA = seleccionarPalabraAleatoriaIA(silabaObjetivoGlobal); // IA usa la última sílaba de la palabra del JUGADOR
            if (nuevaPalabraIA) {
                palabraAnteriorGlobal = nuevaPalabraIA; // La palabra de la IA se convierte en la anterior
                const nuevaUltimaSilabaIA = obtenerUltimaSilaba(nuevaPalabraIA);
                if (!nuevaUltimaSilabaIA) {
                    terminarJuego("Error de la IA al obtener su propia sílaba.");
                    return;
                }
                silabaObjetivoGlobal = nuevaUltimaSilabaIA; // El jugador debe empezar con la última sílaba de la palabra de la IA
                
                // Mostrar la palabra de la IA y preparar turno del jugador
                setTimeout(() => { // Pequeña pausa para que el jugador lea
                    messageDisplay.textContent = `IA dice: "${nuevaPalabraIA}". ¡Tu turno!`;
                    resaltarSilabaEnPantalla(nuevaPalabraIA, silabaObjetivoGlobal);
                    palabraProcesadaEnTurnoActual = false; 
                    tiempoRestante = TIEMPO_TURNO_NORMAL;
                    iniciarTemporizador(); 
                    iniciarEscucha(); 
                }, 1500); // Pausa de 1.5 segundos
            } else {
                terminarJuego(`¡Increíble! La IA no encontró palabra que empiece con "${silabaObjetivoGlobal.toUpperCase()}". ¡Has ganado!`);
            }
        } else { // modoDeJuego === '2P'
            jugadorActual2P = (jugadorActual2P === 1) ? 2 : 1;
            turnInfoDisplay.textContent = `Turno: Jugador ${jugadorActual2P}`;
            actualizarResaltadoTurno2P();
            messageDisplay.textContent = `¡Correcto! (+${puntosGanados} pts). Turno del Jugador ${jugadorActual2P}.`;
            resaltarSilabaEnPantalla(palabraAnteriorGlobal, silabaObjetivoGlobal); // Mostrar la palabra del jugador anterior
            
            palabraProcesadaEnTurnoActual = false; 
            tiempoRestante = TIEMPO_TURNO_NORMAL;
            iniciarTemporizador(); 
            iniciarEscucha(); 
        }
    }
    
    // --- FUNCIONES AUXILIARES (Silabificación, Normalización, UI, etc.) ---
    function obtenerSilabas(palabraNORMALIZADA) { /* (Sin cambios) */
        if (!palabraNORMALIZADA) return [];
        const VOCALES_MAYUS = "AEIOUÁÉÍÓÚÜ";
        const silabasRegex = new RegExp( `[^${VOCALES_MAYUS}]*[${VOCALES_MAYUS}]+(?:[^${VOCALES_MAYUS}]+(?![${VOCALES_MAYUS}])|[^${VOCALES_MAYUS}]*(?=$))`, 'gi');
        let matches = palabraNORMALIZADA.match(silabasRegex);
        if (matches && matches.length > 0) return matches.filter(s => s && s.length > 0).map(s => s.toUpperCase());
        return [palabraNORMALIZADA];
    }
    function obtenerUltimaSilaba(palabraNORMALIZADA) { /* (Sin cambios) */
        const silabas = obtenerSilabas(palabraNORMALIZADA);
        if (silabas && silabas.length > 0) return silabas[silabas.length - 1];
        return null;
    }
    function resaltarSilabaEnPantalla(palabra, silaba) { /* (Sin cambios) */
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
    function manejarErrorVoz(evento) { /* (Adaptar mensaje si es necesario, pero la lógica de reinicio es general) */
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
        } else { // Pantalla de selección
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
    function actualizarListaPalabrasUsadas() { /* (Sin cambios) */
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
    function iniciarTemporizador() { /* (tiempoRestante se setea antes de llamar esta func) */
        clearTimeout(temporizadorId);
        timerDisplay.textContent = `Tiempo: ${tiempoRestante}s`;
        temporizadorId = setInterval(() => {
            tiempoRestante--;
            timerDisplay.textContent = `Tiempo: ${tiempoRestante}s`;
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
        // jugadorGanador2P: si es 1, gana J1; si es 2, gana J2. Si es null y es 2P, el jugador actual perdió.
        // Para 1P, jugadorGanador2P es irrelevante o se puede usar para indicar si el jugador ganó/perdió contra IA.
        if (!estaJugando && !mensajePrincipal.includes("silenciosamente")) return; // Evitar múltiples finales, a menos que sea silencioso
        
        estaJugando = false;
        clearTimeout(temporizadorId);
        if (recognition && speechRecognitionActivo) recognition.abort(); 
        speechRecognitionActivo = false;
        
        let mensajeCompleto = mensajePrincipal;
        if (modoDeJuego === '1P') {
            mensajeCompleto += ` Puntuación final: ${puntuacionJ1}.`;
        } else if (modoDeJuego === '2P') {
            let ganadorMsg = "";
            if (jugadorGanador2P) { // Si se especifica un ganador explícito
                ganadorMsg = ` ¡Gana Jugador ${jugadorGanador2P}!`;
            } else if (mensajePrincipal.includes("agotado") || mensajePrincipal.includes("empieza con") || mensajePrincipal.includes("ya fue dicha") || mensajePrincipal.includes("micrófono") || mensajePrincipal.includes("sílaba")) {
                // Si no hay ganador explícito y es un error del jugador actual, gana el otro
                const ganadorDeterminado = jugadorActual2P === 1 ? 2 : 1;
                ganadorMsg = ` ¡Gana Jugador ${ganadorDeterminado}!`;
            }
            mensajeCompleto += ganadorMsg;
            mensajeCompleto += ` Puntuaciones finales - J1: ${puntuacionJ1}, J2: ${puntuacionJ2}.`;
        }
        
        messageDisplay.textContent = mensajeCompleto;
        statusDisplay.textContent = 'Elige un modo o presiona "Comenzar Juego" si ya elegiste.';
        startGameButton.disabled = false; // Se reactiva para el modo actual
        backToModeSelectionButton.classList.remove('hidden'); // Mostrar para cambiar modo
        
        timerDisplay.textContent = `Tiempo: -`;
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
        // No mostrar mensajes, solo resetear estado
        messageDisplay.textContent = "";
        statusDisplay.textContent = "";
        timerDisplay.textContent = "Tiempo: -";
        challengeWordDisplay.innerHTML = "---";
        if (modoDeJuego === '2P') turnInfoDisplay.textContent = "Turno: ---";
    }

    function normalizarTexto(texto) { /* (Sin cambios) */
        if (!texto) return '';
        return texto.trim().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡"]/g,"")
            .replace(/\s\s+/g, ' '); 
    }

    startGameButton.addEventListener('click', iniciarJuego);
});