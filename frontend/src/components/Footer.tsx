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
    </footer>
  );
}
