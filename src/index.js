
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://jessiricura.github.io",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    const apiUrl = env.SUPABASE_URL
      ?.trim()
      .replace(/\/+$/, "")
      .replace(/\/rest\/v1$/, "");

    const apiKey = env.SUPABASE_SECRET_KEY?.trim();

    if (!apiUrl || !apiKey) {
      return json({ error: "Falta configurar Supabase" }, 500);
    }

    if (url.pathname === "/preguntas" && request.method === "GET") {
      try {
        const response = await fetch(
          `${apiUrl}/rest/v1/preguntas?select=id,pregunta,respuesta_a,respuesta_b,respuesta_c,respuesta_d,dificultad&activa=eq.true&limit=10`,
          {
            headers: { apikey: apiKey },
          }
        );

        const data = await response.json();
        return json(data, response.status);
      } catch (error) {
        return json({ error: String(error) }, 500);
      }
    }

    if (url.pathname === "/comprobar" && request.method === "POST") {
      try {
        const body = await request.json();
        const id = Number(body.id);
        const respuesta = String(body.respuesta || "").toUpperCase();

        if (!Number.isInteger(id) || id < 1 ||
            !["A", "B", "C", "D"].includes(respuesta)) {
          return json({ error: "Datos de respuesta no válidos" }, 400);
        }

        const consulta = new URL(`${apiUrl}/rest/v1/preguntas`);
        consulta.searchParams.set("select", "respuesta_correcta");
        consulta.searchParams.set("id", `eq.${id}`);
        consulta.searchParams.set("activa", "eq.true");
        consulta.searchParams.set("limit", "1");

        const response = await fetch(consulta, {
          headers: { apikey: apiKey },
        });

        if (!response.ok) {
          return json({ error: "No se pudo comprobar la respuesta" }, 500);
        }

        const data = await response.json();

        if (!data.length) {
          return json({ error: "Pregunta no encontrada" }, 404);
        }

        const correcta = String(data[0].respuesta_correcta).toUpperCase();

        return json({
          correcta: respuesta === correcta,
          puntos: respuesta === correcta ? 100 : 0,
        });

      } catch (error) {
        return json({
          error: "Error al comprobar la respuesta",
          detalle: String(error),
        }, 500);
      }
    }

    return json({ error: "Ruta no encontrada" }, 404);
  },
};
