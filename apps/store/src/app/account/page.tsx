import { loginAction, logoutAction } from '@/app/actions/account';
import { STORE_ACCOUNTS } from '@/accounts/accounts';
import { Button, Card, PageTitle } from '@/components/ui';
import { getAccount } from '@/server/context';

export const dynamic = 'force-dynamic';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [account, params] = await Promise.all([getAccount(), searchParams]);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageTitle>Conta</PageTitle>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Contas fictícias de demonstração, sem senha. Ao entrar, o Lever passa a usar o id da conta
        no lugar do id anônimo, e a variante do checkout pode mudar.
      </p>
      {params.error === '1' ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Conta desconhecida.
        </p>
      ) : null}
      {account === undefined ? (
        <Card title="Entrar como">
          <ul className="flex flex-col gap-2">
            {STORE_ACCOUNTS.map((option) => (
              <li key={option.id}>
                <form action={loginAction} className="flex items-center justify-between gap-4">
                  <input type="hidden" name="accountId" value={option.id} />
                  <span>{option.name}</span>
                  <Button type="submit" variant="secondary" size="sm">
                    Entrar como {option.name}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <form action={logoutAction} className="flex items-center justify-between gap-4">
            <span>
              Você entrou como <strong data-testid="account-name">{account.name}</strong>.
            </span>
            <Button type="submit" variant="secondary" size="sm">
              Sair
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
