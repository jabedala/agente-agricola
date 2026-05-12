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

    // --- NUEVA LÓGICA DE LOGIN ---
    if (action === 'login') {
      // Ajusta 'Usuarios' y los nombres de columna según tu base de datos
      const [userRows] = await connection.execute(
        'SELECT usuario, nombre FROM usuarios WHERE usuario = ? AND pass = ?',
        [username, password]
      );
      await connection.end();

      if (userRows.length > 0) {
        return res.status(200).json({ success: true, user: userRows[0] });
      } else {
        return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
      }
    }

    // --- LÓGICA DEL CHAT (Ya existente) ---
    const [rowsPersonas] = await connection.execute('SELECT * FROM Personas');
    const [rowsParcelas] = await connection.execute('SELECT * FROM Parcelas');
    await connection.end();

    let contextoDB = "SISTEMA DE REFERENCIA AGRÍCOLA (SQL):\n" + JSON.stringify(rowsPersonas) + JSON.stringify(rowsParcelas);

    const promptMaestro = `Eres un asistente agrícola. Contexto: ${contextoDB}. Usuario ID: ${idEmpleado}. Mensaje: ${mensaje}`;

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const fetchResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptMaestro }] }] })
    });

    const data = await fetchResponse.json();
    const respuestaIA = data.candidates[0].content.parts[0].text;

    return res.status(200).json({ texto: respuestaIA });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}