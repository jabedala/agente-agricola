import mysql from 'mysql2/promise';



export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { mensaje, idEmpleado, action, username, password, history } = req.body;

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
    // ==========================================
    // PASO 1: EL ROUTER DE INTENCIONES (CON GEMINI)
    // ==========================================
    const urlGemini = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const promptRouter = `
      Analiza el mensaje del usuario y clasifícalo en una de estas 4 intenciones. 
      Responde ÚNICAMENTE con una de estas palabras clave, sin puntos, sin saludos y sin texto extra: 'TRABAJO', 'ASISTENCIA', 'MONITOREO' o 'CONSULTA'.

      Mensaje: "${mensaje}"
      Intención:`;

    let intencion = 'TRABAJO'; // Valor por defecto en caso de fallo

    try {
      const routerResponse = await fetch(urlGemini, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptRouter }] }] })
      });
      
      const routerData = await routerResponse.json();

      // Validamos rigurosamente que la respuesta de Gemini traiga estructura válida
      if (routerData.candidates && routerData.candidates.length > 0 && routerData.candidates[0].content) {
        let textoRouter = routerData.candidates[0].content.parts[0].text.trim().toUpperCase();
        
        if (textoRouter.includes('TRABAJO')) intencion = 'TRABAJO';
        else if (textoRouter.includes('ASISTENCIA')) intencion = 'ASISTENCIA';
        else if (textoRouter.includes('MONITOREO')) intencion = 'MONITOREO';
        else if (textoRouter.includes('CONSULTA')) intencion = 'CONSULTA';
      } else {
        console.warn("[ROUTER WARN] Gemini no devolvió candidatos válidos para la intención. Usando respaldo por código.");
        // Respaldo rápido por código por si la IA parpadea
        const m = mensaje.toLowerCase();
        if (m.includes('entré') || m.includes('salí') || m.includes('asistencia')) intencion = 'ASISTENCIA';
        else if (m.includes('plaga') || m.includes('monitoreo')) intencion = 'MONITOREO';
        else if (m.includes('cuánto') || m.includes('ayer') || m.includes('semana')) intencion = 'CONSULTA';
      }
    } catch (routerError) {
      console.error("[ROUTER ERROR] Falló la llamada de clasificación a Gemini:", routerError.message);
    }

    // AHORA SÍ verás esta línea pase lo que pase, porque el flujo está protegido
    console.log(`[ROUTER LOG] Intención definitiva: "${intencion}" para el mensaje: "${mensaje}"`);


    // ==========================================
    // PASO 2: CARGA DINÁMICA DE TABLAS SEGÚN INTENCIÓN
    // ==========================================
    let contextoDB = "";
    let reglasNegocio = "";

    const [empleadoActual] = await connection.execute('SELECT Nombre, Tipo FROM ParaAgentePersonas WHERE id = ?', [idEmpleado]);
    const esEncargado = empleadoActual[0]?.Tipo === 'M';

    if (intencion === 'TRABAJO') {
      const [personas] = await connection.execute('SELECT * FROM ParaAgentePersonas WHERE Sector=1');
      const [parcelas] = await connection.execute('SELECT * FROM ParaAgenteParcelas WHERE Sector=1');
      const [promedios] = await connection.execute('SELECT * FROM ParaAgentePromedios WHERE Sector=1');
      const [trabajos] = await connection.execute('SELECT * FROM ParaAgenteTrabajos');
      
      contextoDB = `EMPLEADOS DEL SECTOR: ${JSON.stringify(personas)}\nPARCELAS: ${JSON.stringify(parcelas)}\nTRABAJOS DISPONIBLES: ${JSON.stringify(trabajos)}\nPROMEDIOS ESPERADOS: ${JSON.stringify(promedios)}`;
      reglasNegocio = `Tu objetivo es registrar labores agrícolas. El usuario actual es ${empleadoActual[0]?.Nombre}. PERMISOS: ${esEncargado ? 'Es ENCARGADO (M), puede registrar para cualquiera.' : 'Es OPERARIO, SOLO puede registrar para sí mismo.'} Cuando todos los datos estén claros (quién, dónde, qué trabajo y cantidad), genera un bloque JSON al final con el formato exacto: [[REGISTRO_TRABAJO:{"id_persona":X,"id_parcela":Y,"id_trabajo":Z,"cantidad":N}]]`;

    } else if (intencion === 'ASISTENCIA') {
      contextoDB = `EMPLEADO ACTUAL: ${JSON.stringify(empleadoActual[0])}`;
      reglasNegocio = `Registra marcas de entrada o salida. Pregunta si falta definir el tipo. Al finalizar genera: [[REGISTRO_ASISTENCIA:{"id_persona":${idEmpleado},"tipo":"ENTRADA" o "SALIDA"}]]`;

    } else if (intencion === 'MONITOREO') {
      const [parcelas] = await connection.execute('SELECT * FROM ParaAgenteParcelas WHERE Sector=1');
      contextoDB = `PARCELAS: ${JSON.stringify(parcelas)}`;
      reglasNegocio = `Ayuda a registrar evaluaciones de plagas o cultivos. Al finalizar genera: [[REGISTRO_MONITOREO:{"id_parcela":X,"detalle":"..."}]]`;

    } else { // CONSULTA
      const [proc] = await connection.execute('SELECT * FROM ParaAgenteTrabajos'); 
      contextoDB = `CATÁLOGO DE TRABAJOS: ${JSON.stringify(proc)}`;
      reglasNegocio = "El usuario consulta información o procedimientos. Explica basándote en los datos.";
    }

    await connection.end();


    // ==========================================
    // PASO 3: LLAMADA FINAL A GEMINI CON CONTEXTO Y MEMORIA
    // ==========================================
    const promptMaestro = `
      ${reglasNegocio}
      
      DATOS DE LA BASE DE DATOS PARA ESTA SITUACIÓN:
      ${contextoDB}

      HISTORIAL DE LA SESIÓN:
      ${JSON.stringify(history || [])}

      MENSAJE ACTUAL DEL USUARIO:
      ${mensaje}
    `;

    const fetchResponse = await fetch(urlGemini, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptMaestro }] }] })
    });

    const data = await fetchResponse.json();

    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
      const respuestaIA = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ texto: respuestaIA });
    } else {
      console.error("Gemini final falló:", data);
      return res.status(200).json({ texto: "Hola, pude entender tu intención pero el motor de respuesta está experimentando alta demanda. ¿Podrías intentar enviarme el mensaje nuevamente?" });
    }


  } catch (error) {
    console.error("Error en el servidor:", error);
    return res.status(500).json({ error: error.message });
  }
    
}