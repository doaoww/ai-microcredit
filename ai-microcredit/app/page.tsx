import Link from 'next/link';

export default function Home() {
  return <>
    <header className="site-header"><Link href="/">Кредитный кабинет</Link><Link href="/login">Войти</Link></header>
    <main><h1>Кредитный кабинет</h1><p>Войдите, чтобы посмотреть состояние вашей заявки.</p></main>
  </>;
}
