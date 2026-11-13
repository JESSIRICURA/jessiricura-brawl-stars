
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
        concurso: "Brawl Stars"
      });
    }

    if (url.pathname === "/preguntas") {
      if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
        return Response.json(
          { error: "Falta configurar Supabase" },
          { status: 500 }
        );
      }

      const response = await fetch(
        `${env.SUPABASE_URL}/rest/v1/preguntas?select=id,pregunta,respuesta_a,respuesta_b,respuesta_c,respuesta_d,respuesta_correcta,dificultad&activa=eq.true&limit=10`,
        {
          headers: {
            apikey: env.SUPABASE_SECRET_KEY
          }
        }
      );

      const data = await response.json();

      return Response.json(data, {
        status: response.status
      });
    }

    return Response.json(
      { error: "Ruta no encontrada" },
      { status: 404 }
    );
  }
};
