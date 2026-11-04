'use client';

import { Button } from '@/components/ui';

// Generic message only: no internal details reach the browser (store plan, section 4).
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="py-12 text-center">
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Tente de novo.</p>
      <Button className="mt-4" onClick={reset}>
        Tentar de novo
      </Button>
    </section>
  );
}
