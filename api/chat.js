import mysql from 'mysql2/promise';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { mensaje, idEmpleado, action, username, password } = req.body;

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: parseInt(process.env.DB_PORT) || 3306
    });

    // --- LÓGICA DE LOGIN ---
    if (action === 'login') {
      const [userRows] = await connection.execute(
        'SELECT id, Nombre, Sector FROM ParaAgentePersonas WHERE id = ? AND pass = ?',
        [username, password]
      );
      await connection.end();

      if (userRows.length > 0) {
        return res.status(200).json({ success: true, user: userRows[0] });
      } else {
        return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
      }
    }


    /*
    // --- LÓGICA DEL CHAT ---
    const [rowsPersonas] = await connection.execute('SELECT * FROM ParaAgentePersonas WHERE Sector=1');
    const [rowsParcelas] = await connection.execute('SELECT * FROM ParaAgenteParcelas WHERE Sector=1');
    const [rowsPromedios] = await connection.execute('SELECT * FROM ParaAgentePromedios WHERE Sector=1');
    const [rowsTrabajos] = await connection.execute('SELECT * FROM ParaAgenteTrabajos');
    
    await connection.end();

    // Separamos las tablas con títulos claros para que Gemini no se confunda
    let contextoDB = `
      DATOS DEL SECTOR 1:
      - EMPLEADOS: ${JSON.stringify(rowsPersonas)}
      - PARCELAS: ${JSON.stringify(rowsParcelas)}
      - PROMEDIOS: ${JSON.stringify(rowsPromedios)}
      - CATÁLOGO DE TRABAJOS: ${JSON.stringify(rowsTrabajos)}
    `;

    const promptMaestro = `
      Eres un asistente de registro agrícola. 
      REGLAS:
      1. Usa los DATOS DEL SECTOR  para validar nombres y lugares.
      2. El usuario actual tiene el ID: ${idEmpleado}.
      3. Si el usuario intenta registrar algo, valida que el trabajo y la parcela existan en los datos.

      CONTEXTO:
      ${contextoDB}

      MENSAJE DEL USUARIO:
      ${mensaje}
    `;

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const fetchResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptMaestro }] }] })
    });

    const data = await fetchResponse.json();

    // Validación de seguridad para la respuesta de Gemini
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
      const respuestaIA = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ texto: respuestaIA });
    } else {
      console.error("Respuesta fallida de Gemini:", data);
      return res.status(500).json({ error: "La IA no pudo procesar el mensaje", details: data });
    }
    */
   
    // ==========================================
    // PASO 1: EL ROUTER DE INTENCIONES
    // ==========================================
    const urlGemini = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const promptRouter = `
      Analiza el mensaje del usuario y clasifícalo en una de estas 4 intenciones. 
      Responde ÚNICAMENTE con la palabra clave: 'TRABAJO', 'ASISTENCIA', 'MONITOREO' o 'CONSULTA'.

      Mensaje: "${mensaje}"
      Intención:`;

    const routerResponse = await fetch(urlGemini, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptRouter }] }] })
    });
    const routerData = await routerResponse.json();
    const intencion = routerData.candidates[0].content.parts[0].text.trim().toUpperCase();

    // Si Gemini responde algo largo como "LA INTENCION ES TRABAJO", buscamos la palabra clave dentro
    if (intencion.includes('TRABAJO')) intencion = 'TRABAJO';
    else if (intencion.includes('ASISTENCIA')) intencion = 'ASISTENCIA';
    else if (intencion.includes('MONITOREO')) intencion = 'MONITOREO';
    else if (intencion.includes('CONSULTA')) intencion = 'CONSULTA';
    else intencion = 'TRABAJO'; // Por defecto, si se confunde, asumimos que es un trabajo

    console.log(`[ROUTER LOG] Intención detectada: "${intencion}" para el mensaje: "${mensaje}"`);

    // ==========================================
    // PASO 2: CARGA DINÁMICA DE CONTEXTO SQL
    // ==========================================
    let contextoDB = "";
    let reglasNegocio = "";

    if (intencion === 'TRABAJO') {
      const [personas] = await connection.execute('SELECT id, Nombre FROM ParaAgentePersonas WHERE Sector=1');
      const [parcelas] = await connection.execute('SELECT id, Nombre FROM ParaAgenteParcelas WHERE Sector=1');
      const [trabajos] = await connection.execute('SELECT id, Nombre FROM ParaAgenteTrabajos');
      
      contextoDB = `EMPLEADOS: ${JSON.stringify(personas)}\nPARCELAS: ${JSON.stringify(parcelas)}\nTRABAJOS: ${JSON.stringify(trabajos)}`;
      reglasNegocio = "Tu objetivo es registrar tareas agrícolas. Cuando termines, genera el JSON con formato [[REGISTRO_TRABAJO:{...}]]";

    } else if (intencion === 'ASISTENCIA') {
      // Para asistencia solo necesitamos saber quién es el empleado actual
      const [empleado] = await connection.execute('SELECT id, Nombre FROM ParaAgentePersonas WHERE id = ?', [idEmpleado]);
      
      contextoDB = `EMPLEADO_ACTUAL: ${JSON.stringify(empleado)}`;
      reglasNegocio = "Tu objetivo es registrar la entrada o salida (marca de reloj) del empleado. Pregunta si es Entrada o Salida si no lo detalla. Al finalizar, genera el JSON: [[REGISTRO_ASISTENCIA:{\"id_persona\":X, \"tipo\":\"ENTRADA\" o \"SALIDA\"}]]";

    } else if (intencion === 'MONITOREO') {
      const [plagas] = await connection.execute('SELECT id, NombreComun FROM ParaAgentePlagas');
      const [parcelas] = await connection.execute('SELECT id, Nombre FROM ParaAgenteParcelas WHERE Sector=1');
      
      contextoDB = `PLAGAS: ${JSON.stringify(plagas)}\nPARCELAS: ${JSON.stringify(parcelas)}`;
      reglasNegocio = "Tu objetivo es registrar monitoreos de plagas o estado de cultivo. Al finalizar, genera el JSON: [[REGISTRO_MONITOREO:{...}]]";

    } else { // CONSULTA
      // 1. Preguntamos rápido a Gemini qué tipo de consulta es
      const promptSubRouter = `
        Analiza el mensaje de consulta del usuario y clasifícalo en una de estas 3 sub-intenciones.
        Responde ÚNICAMENTE con la palabra clave: 'PROCEDIMIENTO', 'ASISTENCIA_HISTORICA' o 'TRABAJOS_SEMANA'.

        Mensaje: "${mensaje}"
        Sub-intención:`;

      const subRouterResponse = await fetch(urlGemini, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptSubRouter }] }] })
      });
      const subRouterData = await subRouterResponse.json();
      const subIntencion = subRouterData.candidates[0].content.parts[0].text.trim().toUpperCase();

      // 2. Ejecutamos el SQL específico según la sub-intención
      if (subIntencion === 'PROCEDIMIENTO') {
        // Traemos de la base de datos el manual o procedimiento que menciona el usuario
        // Por ejemplo, una tabla donde guardes texto de capacitaciones o protocolos
        const [procedimientos] = await connection.execute(
          'SELECT titulo, descripcion FROM ParaAgenteProcedamientos WHERE ? LIKE CONCAT("%", palabra_clave, "%") LIMIT 3', 
          [mensaje]
        );
        contextoDB = `MANUALES_Y_PROCEDIMIENTOS: ${JSON.stringify(procedimientos)}`;
        reglasNegocio = "El usuario quiere saber cómo se hace una tarea. Explícale el procedimiento usando los manuales proporcionados.";

      } else if (subIntencion === 'ASISTENCIA_HISTORICA') {
        // Traemos las marcas de ayer o días recientes del empleado logueado
        const [marcas] = await connection.execute(
          'SELECT fecha, hora, tipo FROM ParaAgenteMarcas WHERE id_persona = ? ORDER BY fecha DESC, hora DESC LIMIT 10',
          [idEmpleado]
        );
        contextoDB = `HISTORIAL_DE_ASISTENCIA_EMPLEADO: ${JSON.stringify(marcas)}`;
        reglasNegocio = "El usuario está consultando sus marcas de entrada/salida recientes. Respóndele detallando sus horarios.";

      } else if (subIntencion === 'TRABAJOS_SEMANA') {
        // Traemos los trabajos registrados en los últimos 7 días
        const [trabajosSemanales] = await connection.execute(
          'SELECT fecha, id_parcela, cantidad FROM ParaAgenteRegistroTrabajos WHERE id_persona = ? AND fecha >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)',
          [idEmpleado]
        );
        contextoDB = `TRABAJOS_REGISTRADOS_ESTA_SEMANA: ${JSON.stringify(trabajosSemanales)}`;
        reglasNegocio = "El usuario quiere ver qué ha registrado esta semana. Súmale las cantidades por parcela si es necesario y dale un resumen.";
      }
    }

    await connection.end(); // Cerramos la conexión SQL

    // ==========================================
    // PASO 3: RESPUESTA FINAL CON MEMORIA
    // ==========================================
    const promptMaestro = `
      ${reglasNegocio}
      
      DATOS DE REFERENCIA EXCLUSIVOS PARA ESTA CONVERSACIÓN:
      ${contextoDB}

      HISTORIAL DE ESTA SESIÓN (Mantén el hilo hasta lograr el objetivo):
      ${JSON.stringify(history)}

      NUEVO MENSAJE DEL USUARIO:
      ${mensaje}
    `;

    const fetchResponse = await fetch(urlGemini, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptMaestro }] }] })
    });

    const data = await fetchResponse.json();
    const respuestaIA = data.candidates[0].content.parts[0].text;

    return res.status(200).json({ texto: respuestaIA });


  } catch (error) {
    console.error("Error en el servidor:", error);
    return res.status(500).json({ error: error.message });
  }
    
}