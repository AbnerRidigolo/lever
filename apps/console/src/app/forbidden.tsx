import Link from 'next/link';

export default function Forbidden() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Sem permissão</h1>
      <p className="mt-2 text-sm">Seu papel neste projeto não permite esta ação.</p>
      <Link className="mt-3 inline-block text-sm underline" href="/projects">
        Voltar aos projetos
      </Link>
    </main>
  );
}
