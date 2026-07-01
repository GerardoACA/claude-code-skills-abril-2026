// CERBERUS COMERCIO EXTERIOR — pagina de inicio de sesion. NO es SIDF.
// =============================================================================
// Archivo:  src/app/login/page.tsx
// Proposito: Formulario controlado (email + contrasena) que autentica contra el
//            CredentialsProvider de NextAuth (ver src/lib/auth.ts). En caso de
//            exito redirige a /dashboard; en caso de error muestra un mensaje.
// =============================================================================
"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<boolean>(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    // redirect:false para poder mostrar el error sin recargar; navegamos a
    // callbackUrl manualmente cuando la autenticacion es exitosa.
    const resultado = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });

    if (!resultado || resultado.error) {
      setError("Correo o contrasena incorrectos.");
      setEnviando(false);
      return;
    }

    router.push(resultado.url ?? "/dashboard");
  }

  return (
    <main
      style={{
        maxWidth: 400,
        margin: "4rem auto",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
        Iniciar sesion
      </h1>
      <p style={{ color: "#555", marginBottom: "1.5rem" }}>
        CERBERUS Comercio Exterior
      </p>

      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: "1rem" }}>
          <span style={{ display: "block", marginBottom: "0.25rem" }}>
            Correo electronico
          </span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: "1rem" }}>
          <span style={{ display: "block", marginBottom: "0.25rem" }}>
            Contrasena
          </span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
          />
        </label>

        {error !== null && (
          <p role="alert" style={{ color: "#b00020", marginBottom: "1rem" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          style={{
            width: "100%",
            padding: "0.6rem",
            cursor: enviando ? "not-allowed" : "pointer",
          }}
        >
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
