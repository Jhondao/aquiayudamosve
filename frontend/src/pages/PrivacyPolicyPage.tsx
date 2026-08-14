import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function PrivacyPolicyPage() {
  useDocumentTitle("Política de tratamiento de datos personales");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 text-sm leading-relaxed text-slate-300">
      <h1 className="text-xl font-extrabold text-white">Política de tratamiento de datos personales</h1>
      <p className="mt-1 text-xs text-slate-500">
        En cumplimiento de la Ley 1581 de 2012 y el Decreto 1377 de 2013 sobre protección de datos personales
        (Habeas Data) en Colombia.
      </p>

      <h2 className="mt-6 text-sm font-bold text-white">¿Quién trata tus datos?</h2>
      <p className="mt-2">
        AquiAyudamosVE es una iniciativa comunitaria y sin fines de lucro, mantenida por voluntarios, nacida como
        respuesta al terremoto del 10 de agosto de 2026 en Cali. No es una empresa ni recolecta datos con fines
        comerciales o publicitarios.
      </p>

      <h2 className="mt-6 text-sm font-bold text-white">Qué datos recolectamos y para qué</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>
          <strong className="text-white">Nombre, correo y/o celular</strong> — al publicar un reporte, pedir ayuda o
          confirmar un reporte sin crear cuenta. Se usan únicamente para darte una identidad estable dentro de la
          plataforma (para que tus reportes y confirmaciones puedan asociarse a ti, y para el sistema de reputación
          que evita que la misma persona confirme su propio reporte), y para poder contactarte sobre ese reporte
          específico si hace falta.
        </li>
        <li>
          <strong className="text-white">Ubicación</strong> — la del punto de ayuda o necesidad que reportas. Para
          categorías que involucran personas heridas o vulnerables, la coordenada se redondea automáticamente antes
          de guardarse, para no exponer una ubicación exacta.
        </li>
        <li>
          <strong className="text-white">Fotos de evidencia</strong> (opcional) — si decides adjuntar una, se le
          quita automáticamente la información EXIF (incluida la ubicación GPS del dispositivo) antes de guardarla.
        </li>
      </ul>

      <h2 className="mt-6 text-sm font-bold text-white">Con quién se comparten</h2>
      <p className="mt-2">
        Nunca se venden ni se comparten con terceros para fines comerciales o publicitarios. Sí se almacenan en la
        infraestructura técnica que usa la plataforma para funcionar (base de datos y hosting del backend/frontend,
        y un servicio de almacenamiento de archivos para las fotos de evidencia) — esos proveedores procesan los
        datos en nombre de la plataforma, no los usan para sus propios fines.
      </p>

      <h2 className="mt-6 text-sm font-bold text-white">Tus derechos (Habeas Data)</h2>
      <p className="mt-2">Como titular de tus datos, en cualquier momento puedes:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Conocer, actualizar y rectificar tus datos.</li>
        <li>Solicitar prueba de la autorización otorgada.</li>
        <li>Ser informado sobre el uso que se le ha dado a tus datos.</li>
        <li>Revocar tu autorización y/o solicitar la eliminación de tus datos, cuando no exista un deber legal u obligación que lo impida.</li>
        <li>Acceder de forma gratuita a tus datos.</li>
      </ul>

      <h2 className="mt-6 text-sm font-bold text-white">Cómo ejercer estos derechos</h2>
      <p className="mt-2">
        Escríbenos a{" "}
        <a href="mailto:jostele17@gmail.com" className="font-semibold text-accent underline">
          jostele17@gmail.com
        </a>{" "}
        o{" "}
        <a href="mailto:jdorozco13@gmail.com" className="font-semibold text-accent underline">
          jdorozco13@gmail.com
        </a>{" "}
        indicando qué reporte o correo/celular quieres actualizar o eliminar. Si tienes una cuenta registrada,
        también puedes actualizar tu información directamente desde tu perfil.
      </p>

      <h2 className="mt-6 text-sm font-bold text-white">Menores de edad</h2>
      <p className="mt-2">
        Esta plataforma no está dirigida a menores de edad. Si eres el acudiente de un menor y crees que se
        publicaron datos suyos sin tu autorización, escríbenos para retirarlos.
      </p>

      <p className="mt-8 text-xs text-slate-500">
        Esta política puede actualizarse a medida que la plataforma evoluciona. La versión vigente siempre está
        disponible en esta misma página.
      </p>
    </div>
  );
}
