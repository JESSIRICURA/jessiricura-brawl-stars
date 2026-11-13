
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://jessiricura.github.io",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    const json = (data, status = 200) =>
      Response.json(data, {
        status,
        headers: corsHeaders,
      });

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/") {
      return json({
        proyecto: "Jessiricura Brawl Stars Championship",
        estado: "Servidor funcionando",
      });
    }

    if (url.pathname === "/estado") {
      return json({
        servidor: "activo",
        base_de_datos: env.SUPABASE_URL ? "configurada" : "pendiente",
        clave: env.SUPABASE_SECRET_KEY ? "configurada" : "pendiente",
        concurso: "Brawl Stars",
      });
    }

    if (url.pathname === "/preguntas") {
      try {
        const apiUrl = env.SUPABASE_URL
          ?.trim()
          .replace(/\/+$/, "")
          .replace(/\/rest\/v1$/, "");

        const apiKey = env.SUPABASE_SECRET_KEY?.trim();

        if (!apiUrl || !apiKey) {
          return json(
            { error: "Falta configurar Supabase" },
            500
          );
        }

        const response = await fetch(
          `${apiUrl}/rest/v1/preguntas?select=id,pregunta,respuesta_a,respuesta_b,respuesta_c,respuesta_d,dificultad&activa=eq.true&limit=10`,
          {
            headers: {
              apikey: apiKey,
            },
          }
        );

        const data = await response.json();

        return json(data, response.status);

      } catch (error) {
        return json(
          {
            error: "Error al consultar Supabase",
            detalle: String(error),
          },
          500
        );
      }
    }

    return json(
      { error: "Ruta no encontrada" },
      404
    );
  },
};
