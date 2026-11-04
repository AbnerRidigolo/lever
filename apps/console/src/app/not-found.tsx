import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Não encontrado</h1>
      <Link className="mt-3 inline-block text-sm underline" href="/projects">
        Voltar aos projetos
      </Link>
    </main>
  );
}
