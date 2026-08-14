import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="mt-10 border-t border-border px-4 py-6 text-center text-xs text-slate-500">
      <p>
        AquiAyudamosVE es una iniciativa comunitaria, desarrollada sin fines de lucro, para apoyar a quienes lo
        necesitan durante la emergencia.
      </p>
      <p className="mt-2">
        <Link to="/privacidad" className="underline hover:text-slate-300">
          Política de tratamiento de datos personales
        </Link>
      </p>
      <p className="mt-2">
        Es un proyecto de código abierto — si quieres colaborar, escríbenos a{" "}
        <a href="mailto:jostele17@gmail.com" className="underline hover:text-slate-300">
          jostele17@gmail.com
        </a>{" "}
        o{" "}
        <a href="mailto:jdorozco13@gmail.com" className="underline hover:text-slate-300">
          jdorozco13@gmail.com
        </a>
        .
      </p>
    </footer>
  );
}
