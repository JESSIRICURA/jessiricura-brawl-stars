
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        proyecto: "Jessiricura Brawl Stars Championship",
        estado: "Servidor funcionando"
      });
    }

    if (url.pathname === "/estado") {
      return Response.json({
        servidor: "activo",
        base_de_datos: env.SUPABASE_URL ? "configurada" : "pendiente",
        clave: env.SUPABASE_SECRET_KEY ? "configurada" : "pendiente",
        concurso: "Brawl Stars"
      });
    }

    if (url.pathname === "/preguntas") {
      try {
        const apiUrl = env.SUPABASE_URL?.trim();
        const apiKey = env.SUPABASE_SECRET_KEY?.replace(/\s+/g, "");

        if (!apiUrl || !apiKey) {
          return Response.json(
            { error: "Falta configurar la URL o la clave de Supabase" },
            { status: 500 }
          );
        }

        const response = await fetch(
          `${apiUrl}/rest/v1/preguntas?select=id,pregunta,respuesta_a,respuesta_b,respuesta_c,respuesta_d,respuesta_correcta,dificultad&activa=eq.true&limit=10`,
          {
            headers: {
              apikey: apiKey
            }
          }
        );

        const data = await response.json();

        return Response.json(data, {
          status: response.status
        });
      } catch (error) {
        return Response.json(
          { error: "Error al consultar Supabase", detalle: String(error) },
          { status: 500 }
        );
      }
    }

    return Response.json(
      { error: "Ruta no encontrada" },
      { status: 404 }
    );
  }
};
