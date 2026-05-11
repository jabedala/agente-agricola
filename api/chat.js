import mysql from 'mysql2/promise';

export default async function handler(req, res) {
  // 1. Validar método
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { mensaje, idEmpleado } = req.body;

  try {
    // 2. Conexión a MySQL usando las variables de entorno de Vercel
    // Asegúrate de haberlas agregado en el panel de Vercel
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: parseInt(process.env.DB_PORT) || 3306,
      connectTimeout: 10000 // 10 segundos de margen
    });

    // 3. Consultas a tus tablas (Ajusta los nombres si son diferentes)
    const [rowsPersonas] = await connection.execute('SELECT * FROM ParaAgentePersonas WHERE Sector=1');
    const [rowsParcelas] = await connection.execute('SELECT * FROM ParaAgenteParcelas WHERE Sector=1');
    
    // Cerramos la conexión inmediatamente después de obtener los datos
    await connection.end();

    // 4. Convertir datos a texto para Gemini
    let contextoDB = "SISTEMA DE REFERENCIA AGRÍCOLA (SQL):\n\n";
    contextoDB += "TABLA PERSONAS:\n" + JSON.stringify(rowsPersonas) + "\n\n";
    contextoDB += "TABLA PARCELAS:\n" + JSON.stringify(rowsParcelas) + "\n\n";

    // 5. El Prompt Maestro
    const promptMaestro = `
      Eres un asistente de registro agrícola.
      Usa la siguiente información de la base de datos para responder y validar:
      ${contextoDB}

      Usuario actual: ID ${idEmpleado}
      Mensaje del usuario: ${mensaje}
    `;

    // 6. Llamada a Gemini (usando fetch directo)
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const fetchResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptMaestro }] }]
      })
    });

    const data = await fetchResponse.json();

    if (data.candidates && data.candidates[0].content) {
      const respuestaIA = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ texto: respuestaIA });
    } else {
      throw new Error(data.error?.message || "Error en la respuesta de Gemini");
    }

  } catch (error) {
    console.error("Error detallado:", error);
    return res.status(500).json({ 
      error: "Error de conexión o consulta", 
      details: error.message 
    });
  }
}