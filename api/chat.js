import mysql from 'mysql2/promise';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { mensaje, idEmpleado } = req.body;

  try {
    // 1. Conexión a MySQL
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306
    });

    // 2. Realizar las consultas (Ajusta los nombres de tus tablas)
    const [rowsPersonas] = await connection.execute('SELECT * FROM ParaAgentePersonas WHERE Sector = 1');
    const [rowsParcelas] = await connection.execute('SELECT * FROM ParaAgenteParcelas WHERE Sector = 1');
    const [rowsTareas] = await connection.execute('SELECT * FROM Promedios WHERE Sector = 1');

    await connection.end(); // Cerramos la conexión

    // 3. Convertir los resultados a un String legible para Gemini
    // Usamos JSON.stringify para que la IA entienda la estructura de filas y columnas
    let contextoDB = "SISTEMA DE REFERENCIA (BASE DE DATOS EN VIVO):\n\n";
    contextoDB += "TABLA PERSONAS:\n" + JSON.stringify(rowsPersonas) + "\n\n";
    contextoDB += "TABLA PARCELAS:\n" + JSON.stringify(rowsParcelas) + "\n\n";
    contextoDB += "TABLA TAREAS:\n" + JSON.stringify(rowsTareas) + "\n\n";

    // 4. Prompt Maestro
    const promptMaestro = `
      Eres un asistente de registro agrícola.
      REGLAS:
      1. Usa los datos de la base de datos para validar.
      2. Si el usuario es ID: ${idEmpleado}, verifica sus permisos en la tabla Personas.
      
      DATOS DE LA BASE DE DATOS:
      ${contextoDB}

      MENSAJE DEL USUARIO:
      ${mensaje}
    `;

    // 5. Llamada a Gemini (el método fetch que ya nos funciona)
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const fetchResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptMaestro }] }]
      })
    });

    const data = await fetchResponse.json();
    const respuestaIA = data.candidates[0].content.parts[0].text;

    return res.status(200).json({ texto: respuestaIA });

  } catch (error) {
    console.error("Error en MySQL o Gemini:", error);
    return res.status(500).json({ error: "Error de conexión con los datos agrícolas", details: error.message });
  }
}