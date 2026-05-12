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

  } catch (error) {
    console.error("Error en el servidor:", error);
    return res.status(500).json({ error: error.message });
  }
}