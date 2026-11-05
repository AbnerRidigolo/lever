import { cookies } from 'next/headers';

import { setPersonaAction, setStubOverridesAction } from '@/app/actions/demo';
import { isNewBannerOn } from '@/lever';
import { CHECKOUT_LAYOUTS } from '@/lever/keys';
import { stubOverridesSchema } from '@/lever/stub-overrides';
import { DEVICES, PERSONA_COUNTRIES } from '@/server/attributes';
import { getIdentity, getPersona } from '@/server/context';
import { COOKIES, parseJsonCookie } from '@/server/cookies';
import { inputFromOverrides } from '@/server/demo-controls';
import { leverAdapterMode } from '@/server/env';

import { Button, Select } from './ui';

/**
 * Lever panel in the footer: who the user is for Lever and what the flag returns, plus the
 * demo persona and the stub overrides (store plan, section 1). The checkout variant is shown
 * on the checkout page only, so users who never reach it are not exposed (D9).
 */
export async function LeverPanel() {
  const [identity, persona, newBanner, cookieStore] = await Promise.all([
    getIdentity(),
    getPersona(),
    isNewBannerOn(),
    cookies(),
  ]);
  const adapter = leverAdapterMode();
  const overrides = inputFromOverrides(
    parseJsonCookie(stubOverridesSchema, cookieStore.get(COOKIES.stubOverrides)?.value),
  );
  const { country, device } = identity.user.attributes;

  return (
    <footer
      data-testid="lever-panel"
      className="mt-12 border-t border-neutral-200 bg-white text-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4">
        <h2 className="font-semibold">Painel do Lever</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr_auto_1fr]">
          <dt className="text-neutral-500">Usuário</dt>
          <dd>
            <code data-testid="panel-user-id" data-user-id={identity.user.id}>
              {identity.user.id.slice(0, 18)}
            </code>{' '}
            (
            <span data-testid="panel-source">
              {identity.source === 'account' ? 'conta' : 'anônimo'}
            </span>
            )
          </dd>
          <dt className="text-neutral-500">Adaptador</dt>
          <dd data-testid="panel-adapter">{adapter}</dd>
          <dt className="text-neutral-500">country</dt>
          <dd data-testid="panel-country">{typeof country === 'string' ? country : 'ausente'}</dd>
          <dt className="text-neutral-500">device</dt>
          <dd data-testid="panel-device">{String(device)}</dd>
          <dt className="text-neutral-500">new-banner</dt>
          <dd data-testid="panel-new-banner">{String(newBanner)}</dd>
        </dl>

        <form action={setPersonaAction} className="flex flex-wrap items-end gap-2">
          <span className="w-full font-medium">Persona de demonstração</span>
          <Select
            name="country"
            defaultValue={persona?.country ?? 'auto'}
            aria-label="country"
            className="w-36"
          >
            <option value="auto">country automático</option>
            {PERSONA_COUNTRIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          <Select
            name="device"
            defaultValue={persona?.device ?? 'auto'}
            aria-label="device"
            className="w-36"
          >
            <option value="auto">device automático</option>
            {DEVICES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" size="sm">
            Aplicar persona
          </Button>
        </form>

        {adapter === 'stub' ? (
          <form action={setStubOverridesAction} className="flex flex-wrap items-end gap-2">
            <span className="w-full font-medium">Sobrescritas do stub (só neste navegador)</span>
            <Select
              name="newBanner"
              defaultValue={overrides.newBanner}
              aria-label="new-banner"
              className="w-44"
            >
              <option value="auto">new-banner: padrão</option>
              <option value="on">new-banner: ligada</option>
              <option value="off">new-banner: desligada</option>
            </Select>
            <Select
              name="checkoutLayout"
              defaultValue={overrides.checkoutLayout}
              aria-label="checkout-layout"
              className="w-52"
            >
              <option value="auto">checkout-layout: controle</option>
              {CHECKOUT_LAYOUTS.map((option) => (
                <option key={option} value={option}>
                  checkout-layout: {option}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary" size="sm">
              Aplicar sobrescritas
            </Button>
          </form>
        ) : null}
      </div>
    </footer>
  );
}
