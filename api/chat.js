import { google } from "googleapis";

export default async function handler(req, res) {
  // 1. Validar método
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { mensaje, idEmpleado } = req.body;

  try {
    // 2. Procesar Credenciales de Google Drive de forma segura
    let credentials;
    try {
      const cleanedJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
        .replace(/\n/g, '') // Elimina saltos de línea accidentales
        .trim();
      
      credentials = JSON.parse(cleanedJson);
      
      if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }
    } catch (e) {
      console.error("Error en formato de credenciales:", e.message);
      return res.status(500).json({ error: "Error en el formato del JSON de Google Drive" });
    }

    // 3. Autenticar con Google Drive
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    const drive = google.drive({ version: 'v3', auth });

    // 4. Obtener archivos CSV de la carpeta
    const folderId = '1X2vD-VmTHiKNM8mXEqr23Nni437SucCU';
    const filesRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
    });

    // 5. Leer contenido de los archivos para crear el contexto
    let contextoCSV = "SISTEMA DE REFERENCIA (TABLAS ACTUALIZADAS):\n\n";
    
    if (filesRes.data.files && filesRes.data.files.length > 0) {
      for (const file of filesRes.data.files) {
        console.log(`Descargando archivo: ${file.name} (ID: ${file.id})`); // LOG DE CONTROL
        
        const content = await drive.files.get({ 
          fileId: file.id, 
          alt: 'media' 
        });

        // Aseguramos la conversión a texto
        const textoArchivo = typeof content.data === 'string' 
          ? content.data 
          : JSON.stringify(content.data);

        console.log(`Tamaño del contenido de ${file.name}: ${textoArchivo.length} caracteres`); // LOG DE CONTROL
        
        contextoCSV += `--- TABLA: ${file.name} ---\n${textoArchivo}\n\n`;
      }
    } else {
      console.log("No se encontraron archivos en la carpeta de Drive.");
      contextoCSV += "AVISO: No se encontraron archivos en la carpeta configurada.\n";
    }

    // 6. Configurar el Prompt Maestro
    const promptMaestro = `
      Eres un asistente de registro agrícola para una empresa.
      
      REGLAS:
      1. Usa SOLO la información de las tablas CSV proporcionadas abajo para validar nombres, parcelas y tareas.
      2. Si el usuario es el empleado ID: ${idEmpleado}, solo puede registrar tareas para sí mismo. 
      3. Si el usuario es un ENCARGADO (ver tabla Personas), puede registrar para otros.
      4. Si faltan datos (lugar, tarea, cantidad), pregunta amablemente.
      5. Cuando el registro esté completo, genera una confirmación clara.

      CONTEXTO DE LAS TABLAS:
      ${contextoCSV}

      MENSAJE DEL USUARIO:
      ${mensaje}
    `;

    // 7. Llamada a Gemini usando Fetch (Método Robusto v1)
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const fetchResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: promptMaestro }]
        }]
      })
    });

    const data = await fetchResponse.json();

    // 8. Manejo de respuesta de Gemini
    if (data.candidates && data.candidates[0].content) {
      const respuestaIA = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ texto: respuestaIA });
    } else if (data.error) {
      throw new Error(`Gemini Error: ${data.error.message}`);
    } else {
      throw new Error("Respuesta de IA no válida o vacía");
    }

  } catch (error) {
    console.error("Error crítico en el servidor:", error);
    return res.status(500).json({ 
      error: "Error procesando el registro agrícola",
      details: error.message 
    });
  }
}