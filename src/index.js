
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

if (url.pathname === "/oauth/twitch") {
  const cuenta = url.searchParams.get("cuenta");

  if (!["bot", "canal"].includes(cuenta)) {
    return json({ error: "Cuenta no válida" }, 400);
  }

  const state = crypto.randomUUID();

  const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const apiKey = env.SUPABASE_SECRET_KEY;

  const guardado = await fetch(
    `${supabaseUrl}/rest/v1/twitch_oauth_states`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
  
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        state,
        cuenta,
        expira_en: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      })
    }
  );

  if (!guardado.ok) {
    return json({ error: "No se pudo preparar la autorización" }, 500);
  }

  const scopes = cuenta === "bot"
    ? "user:read:chat user:write:chat user:bot"
    : "channel:bot";

  const autorizacion = new URL("https://id.twitch.tv/oauth2/authorize");

  autorizacion.searchParams.set("client_id", env.TWITCH_CLIENT_ID);
  autorizacion.searchParams.set("redirect_uri",
    "https://jessiricura-brawl-backend.ricurajessica.workers.dev/oauth/callback");
  autorizacion.searchParams.set("response_type", "code");
  autorizacion.searchParams.set("scope", scopes);
  autorizacion.searchParams.set("state", state);

  return Response.redirect(autorizacion.toString(), 302);
}


if (url.pathname === "/oauth/callback") {
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return json({ error: "Autorización incompleta" }, 400);
    }

    const supabaseUrl = env.SUPABASE_URL.trim().replace(/\/+$/, "");
    const apiKey = env.SUPABASE_SECRET_KEY.trim();

    const consulta = await fetch(
      `${supabaseUrl}/rest/v1/twitch_oauth_states?state=eq.${encodeURIComponent(state)}&select=cuenta,expira_en`,
    { headers: { apikey: apiKey } }
    );

    const estados = await consulta.json();
    const registro = estados[0];

    if (!registro || new Date(registro.expira_en) < new Date()) {
      return json({ error: "Autorización caducada o no válida" }, 400);
    }

    const form = new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: "https://jessiricura-brawl-backend.ricurajessica.workers.dev/oauth/callback"
    });

    const tokenResponse = await fetch(
      "https://id.twitch.tv/oauth2/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form
      }
    );

    const token = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return json({
  error: "Twitch no ha podido autorizar la cuenta",
  detalle: token.message || token.error || "Twitch no ha indicado el motivo"
}, 400);
    }

    const userResponse = await fetch(
      "https://api.twitch.tv/helix/users",
      {
        headers: {
          "Client-ID": env.TWITCH_CLIENT_ID,
          "Authorization": `Bearer ${token.access_token}`
        }
      }
    );

    const userData = await userResponse.json();
    const user = userData.data?.[0];

    if (!user) {
      return json({ error: "No se pudo identificar la cuenta de Twitch" }, 400);
    }

    const cuentaEsperada = registro.cuenta === "bot"
      ? "cuchifleta13"
      : "jessiricura";

    if (user.login.toLowerCase() !== cuentaEsperada) {
      return json({
        error: "Has autorizado la cuenta equivocada. Debes usar " + cuentaEsperada
      }, 400);
    }

    const guardado = await fetch(
      `${supabaseUrl}/rest/v1/twitch_tokens?on_conflict=cuenta`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
         
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify({
          cuenta: registro.cuenta,
          twitch_user_id: user.id,
          display_name: user.display_name,
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
          scopes: token.scope
        })
      }
    );

    if (!guardado.ok) {
      return json({ error: "No se pudieron guardar los permisos" }, 500);
    }

    await fetch(
      `${supabaseUrl}/rest/v1/twitch_oauth_states?state=eq.${encodeURIComponent(state)}`,
      {
        method: "DELETE",
        headers: { apikey: apiKey }
      }
    );

    return json({
      mensaje: "Cuenta autorizada correctamente",
      cuenta: user.display_name
    });

  } catch (error) {
    return json({ error: "Error durante la autorización" }, 500);
  }
}


if (url.pathname === "/eventsub" && request.method === "POST") {
  try {
    const messageId = request.headers.get("Twitch-Eventsub-Message-Id");
    const timestamp = request.headers.get("Twitch-Eventsub-Message-Timestamp");
    const signature = request.headers.get("Twitch-Eventsub-Message-Signature");
    const messageType = request.headers.get("Twitch-Eventsub-Message-Type");

    const body = await request.text();

    if (!messageId || !timestamp || !signature || !messageType) {
      return new Response("Faltan cabeceras", { status: 400 });
    }

    const fecha = Date.parse(timestamp);

    if (!Number.isFinite(fecha) || Math.abs(Date.now() - fecha) > 10 * 60 * 1000) {
      return new Response("Mensaje caducado", { status: 403 });
    }

    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.TWITCH_EVENTSUB_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const firmaCalculada = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(messageId + timestamp + body)
    );

    const hexadecimal = Array.from(new Uint8Array(firmaCalculada))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    const firmaEsperada = "sha256=" + hexadecimal;

    if (signature !== firmaEsperada) {
      return new Response("Firma no válida", { status: 403 });
    }

    const mensaje = JSON.parse(body);

    if (messageType === "webhook_callback_verification") {
      return new Response(mensaje.challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      });
    }

    if (messageType === "notification") {

const evento = mensaje.event;

if (evento) {
  const usuario = evento.chatter_user_login;
  const textoRespuesta = (evento.message?.text || "").trim().toUpperCase();

  console.log("Mensaje recibido de Twitch:", {
    usuario,
    mensaje: textoRespuesta
  });

  if (["A", "B", "C", "D"].includes(textoRespuesta)) {
    try {
      const resultado = await fetch(
       `${env.SUPABASE_URL}/rest/v1/rpc/registrar_respuesta_twitch`,
        {
          method: "POST",
          headers: {
            "apikey": env.SUPABASE_SECRET_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            p_usuario: usuario,
            p_respuesta: textoRespuesta
          })
        }
      );

      const datos = await resultado.json();

      console.log("RESULTADO DEL CONCURSO:", {
        usuario,
        ...datos
      });

    } catch (error) {
      console.log("ERROR AL REGISTRAR RESPUESTA:", String(error));
    }
  }
}

return new Response(null, { status: 204 });
}
      
    if (messageType === "revocation") {
      console.log("Suscripción EventSub revocada");
      return new Response(null, { status: 204 });
    }

    return new Response(null, { status: 204 });

  } catch (error) {
    return new Response("Error procesando EventSub", { status: 500 });
  }
}

    
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

if (url.pathname === "/twitch/eventsub/crear" && request.method === "GET") {
  try {
    const cuentasResponse = await fetch(
      `${apiUrl}/rest/v1/twitch_tokens?select=cuenta,twitch_user_id`,
      {
        headers: { apikey: apiKey }
      }
    );

    if (!cuentasResponse.ok) {
      return json({ error: "No se pudieron consultar las cuentas" }, 500);
    }

    const cuentas = await cuentasResponse.json();
    const bot = cuentas.find(c => c.cuenta === "bot");
    const canal = cuentas.find(c => c.cuenta === "canal");

    if (!bot?.twitch_user_id || !canal?.twitch_user_id) {
      return json({ error: "Faltan las cuentas autorizadas" }, 400);
    }

    const formulario = new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials"
    });

    const tokenResponse = await fetch(
      "https://id.twitch.tv/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formulario
      }
    );

    const token = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return json({
        error: "No se pudo obtener el token de aplicación",
        detalle: token.message || token.error
      }, 400);
    }

    const suscripcion = await fetch(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      {
        method: "POST",
        headers: {
          "Client-ID": env.TWITCH_CLIENT_ID,
          "Authorization": `Bearer ${token.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "channel.chat.message",
          version: "1",
          condition: {
            broadcaster_user_id: canal.twitch_user_id,
            user_id: bot.twitch_user_id
          },
          transport: {
            method: "webhook",
            callback: "https://jessiricura-brawl-backend.ricurajessica.workers.dev/eventsub",
            secret: env.TWITCH_EVENTSUB_SECRET
          }
        })
      }
    );

    const resultado = await suscripcion.json();

    if (!suscripcion.ok) {
      return json({
        error: "Twitch no pudo crear la suscripción",
        detalle: resultado
      }, suscripcion.status);
    }

    return json({
      mensaje: "Suscripción creada correctamente",
      datos: resultado.data
    });

  } catch (error) {
    return json({
      error: "Error creando la suscripción",
      detalle: String(error)
    }, 500);
  }
}
    
if (url.pathname === "/twitch/usuarios" && request.method === "GET") {
  const consulta = await fetch(
    `${apiUrl}/rest/v1/twitch_tokens?select=cuenta,twitch_user_id,display_name`,
    {
      headers: {
        apikey: apiKey
      }
    }
  );

  if (!consulta.ok) {
    return json({ error: "No se pudieron consultar las cuentas de Twitch" }, 500);
  }

  const cuentas = await consulta.json();

  const bot = cuentas.find(cuenta => cuenta.cuenta === "bot");
  const canal = cuentas.find(cuenta => cuenta.cuenta === "canal");

  if (!bot?.twitch_user_id || !canal?.twitch_user_id) {
    return json({ error: "Falta autorizar alguna cuenta de Twitch" }, 400);
  }

  return json({
    canal: {
      nombre: canal.display_name,
      id: canal.twitch_user_id
    },
    bot: {
      nombre: bot.display_name,
      id: bot.twitch_user_id
    }
  });
}

    if (url.pathname === "/avanzar-pregunta" && request.method === "POST") {
  try {
    const resultado = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/avanzar_pregunta_twitch`,
      {
        method: "POST",
        headers: {
          "apikey": env.SUPABASE_SECRET_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      }
    );

    const datos = await resultado.json();

    return new Response(JSON.stringify(datos), {
      status: resultado.ok ? 200 : 500,
headers: {
  "Content-Type": "application/json",
  ...corsHeaders
}
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: String(error)
    }), {
      status: 500,
     headers: {
  "Content-Type": "application/json",
  ...corsHeaders
}
    });
  }
}

    if (url.pathname === "/clasificacion" && request.method === "GET") {
      try {
        const concursosResponse = await fetch(
          `${apiUrl}/rest/v1/concursos?select=id&estado=eq.activo&limit=1`,
          { headers: { apikey: apiKey } }
        );

        if (!concursosResponse.ok) {
          return json({ error: "No se pudo consultar el concurso" }, 500);
        }

        const concursosActivos = await concursosResponse.json();
        let concurso = concursosActivos[0];
        const concursoActivo = Boolean(concurso);

        if (!concurso) {
          const concursosFinalizadosUrl = new URL(`${apiUrl}/rest/v1/concursos`);
          concursosFinalizadosUrl.searchParams.set("select", "id");
          concursosFinalizadosUrl.searchParams.set("estado", "eq.finalizado");
          concursosFinalizadosUrl.searchParams.set("order", "fecha_fin.desc");
          concursosFinalizadosUrl.searchParams.set("limit", "1");

          const finalizadosResponse = await fetch(concursosFinalizadosUrl, {
            headers: { apikey: apiKey }
          });

          if (!finalizadosResponse.ok) {
            return json({ error: "No se pudo consultar el último concurso" }, 500);
          }

          const concursosFinalizados = await finalizadosResponse.json();
          concurso = concursosFinalizados[0];
        }

        if (!concurso) {
          return json({ concurso_activo: false, clasificacion: [] });
        }

        const puntosPorJugador = new Map();
        const tamanoPagina = 1000;
        let desde = 0;

        while (true) {
          const respuestasUrl = new URL(`${apiUrl}/rest/v1/respuestas`);
          respuestasUrl.searchParams.set("select", "twitch_username,puntos_obtenidos");
          respuestasUrl.searchParams.set("concurso_id", `eq.${concurso.id}`);
          respuestasUrl.searchParams.set("order", "id.asc");
          respuestasUrl.searchParams.set("limit", String(tamanoPagina));
          respuestasUrl.searchParams.set("offset", String(desde));

          const respuestasResponse = await fetch(respuestasUrl, {
            headers: { apikey: apiKey }
          });

          if (!respuestasResponse.ok) {
            return json({ error: "No se pudieron consultar las respuestas" }, 500);
          }

          const respuestas = await respuestasResponse.json();

          for (const respuesta of respuestas) {
            const usuario = String(respuesta.twitch_username || "").trim().toLowerCase();
            if (!usuario) continue;

            const puntos = Number(respuesta.puntos_obtenidos) || 0;
            puntosPorJugador.set(usuario, (puntosPorJugador.get(usuario) || 0) + puntos);
          }

          if (respuestas.length < tamanoPagina) break;
          desde += respuestas.length;
        }

        const clasificacion = Array.from(puntosPorJugador, ([usuario, puntos]) => ({
          usuario,
          puntos
        }))
          .sort((a, b) => b.puntos - a.puntos || a.usuario.localeCompare(b.usuario))
          .slice(0, 3);

        return json({
          concurso_activo: concursoActivo,
          clasificacion
        });
      } catch (error) {
        return json({ error: "Error al cargar la clasificación" }, 500);
      }
    }
    
    if (url.pathname === "/preguntas" && request.method === "GET") {
  try {
    const concursoResponse = await fetch(
      `${apiUrl}/rest/v1/concursos?select=pregunta_id_actual&estado=eq.activo&limit=1`,
      {
        headers: { apikey: apiKey }
      }
    );

    if (!concursoResponse.ok) {
      return json({ error: "No se pudo consultar el concurso" }, 500);
    }

    const concursos = await concursoResponse.json();

    if (!concursos.length) {
      return json({ error: "No hay concurso activo" }, 404);
    }

    const preguntaId = concursos[0].pregunta_id_actual;

    if (!preguntaId) {
      return json({ error: "No hay pregunta asignada todavía" }, 409);
    }

    const consulta = new URL(`${apiUrl}/rest/v1/preguntas`);

    consulta.searchParams.set(
      "select",
      "id,pregunta,respuesta_a,respuesta_b,respuesta_c,respuesta_d,dificultad"
    );

    consulta.searchParams.set("id", `eq.${preguntaId}`);
    consulta.searchParams.set("activa", "eq.true");

    const response = await fetch(consulta, {
      headers: { apikey: apiKey }
    });

    const data = await response.json();

    return json(data, response.status);

  } catch (error) {
    return json({ error: String(error) }, 500);
  }
}

if (url.pathname === "/respuesta-correcta" && request.method === "GET") {
  try {
    const id = Number(url.searchParams.get("id"));

    if (!Number.isInteger(id) || id < 1) {
      return json({ error: "ID de pregunta no válido" }, 400);
    }

    // Comprobar cuál es la pregunta actualmente activa
    const concursoConsulta = await fetch(
      `${apiUrl}/rest/v1/concursos?select=pregunta_id_actual&estado=eq.activo&limit=1`,
      {
        headers: { apikey: apiKey }
      }
    );

    if (!concursoConsulta.ok) {
      return json({ error: "No se pudo consultar el concurso" }, 500);
    }

    const concursos = await concursoConsulta.json();

    if (concursos.length && Number(concursos[0].pregunta_id_actual) === id) {
      return json({ error: "La respuesta todavía no está disponible" }, 403);
    }

    // Consultar la respuesta correcta de la pregunta finalizada
    const consulta = new URL(`${apiUrl}/rest/v1/preguntas`);
    consulta.searchParams.set("select", "respuesta_correcta");
    consulta.searchParams.set("id", `eq.${id}`);
    consulta.searchParams.set("limit", "1");

    const response = await fetch(consulta, {
      headers: { apikey: apiKey }
    });

    if (!response.ok) {
      return json({ error: "No se pudo consultar la respuesta" }, 500);
    }

    const data = await response.json();

    if (!data.length) {
      return json({ error: "Pregunta no encontrada" }, 404);
    }

    return json({
      correcta: String(data[0].respuesta_correcta).toUpperCase()
    });

  } catch (error) {
    return json({
      error: "Error al obtener la respuesta correcta",
      detalle: String(error)
    }, 500);
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
