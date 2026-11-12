import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;

createApp().listen(port, () => {
  console.log(`AI Support Engine escuchando en http://localhost:${port}`);
  console.log(`Proveedor generativo: ${process.env.LLM_PROVIDER || 'gemini'}`);
});
