// Ejemplo conceptual de la lógica en api/chat.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from "googleapis";

export default async function handler(req, res) {
  // Solo permitimos peticiones POST
  if (req.method !== 'POST') return res.status(405).send('Método no permitido');

  const { mensaje, idEmpleado } = req.body;

  try {
    // 1. Configurar Autenticación con Google Drive
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    const drive = google.drive({ version: 'v3', auth });

    // 2. Obtener lista de archivos en tu carpeta
    const folderId = '1X2vD-VmTHiKNM8mXEqr23Nni437SucCU';
    const filesRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
    });

    // 3. Descargar contenido de los CSV y unirlos en un gran texto de contexto
    let contextoCSV = "SISTEMA DE REFERENCIA (TABLAS ACTUALIZADAS):\n\n";
    
    for (const file of filesRes.data.files) {
      const content = await drive.files.get({ fileId: file.id, alt: 'media' });
      contextoCSV += `--- TABLA: ${file.name} ---\n${content.data}\n\n`;
    }

    // 4. Inicializar Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 5. Crear el Prompt Maestro
    const prompt = `
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

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    res.status(200).json({ texto: response.text() });

  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ error: "Error procesando el registro" });
  }
}