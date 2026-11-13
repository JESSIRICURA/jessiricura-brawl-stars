export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        proyecto: "Jessiricura Brawl Stars Championship",
        estado: "Servidor funcionando",
        mensaje: "¡Bienvenido al concurso!"
      });
    }

    if (url.pathname === "/estado") {
      return Response.json({
        activo: true,
        concurso: "Brawl Stars"
      });
    }

    return Response.json(
      { error: "Ruta no encontrada" },
      { status: 404 }
    );
  }
};
