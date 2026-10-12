'use client';
import Link from 'next/link';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main><h1>Не удалось загрузить страницу</h1><p>Сервис временно недоступен. Попробуйте ещё раз.</p><button onClick={reset}>Повторить</button><p><Link href="/">На главную</Link></p></main>;
}
