import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="py-12 text-center">
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <Link className="mt-3 inline-block text-sm underline" href="/">
        Voltar à vitrine
      </Link>
    </section>
  );
}
