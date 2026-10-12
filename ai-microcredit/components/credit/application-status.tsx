import type { CreditStatus } from '@/lib/auth/service';

const labels: Record<CreditStatus, string> = {
  PENDING: 'Заявка рассматривается', APPROVED: 'Кредит одобрен',
  REJECTED: 'В кредите отказано', ISSUED: 'Кредит выдан',
};
export function ApplicationStatus({ status }: { status: CreditStatus | null }) {
  return <p>{status ? labels[status] : 'У вас пока нет заявки.'}</p>;
}
